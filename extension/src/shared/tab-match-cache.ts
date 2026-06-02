import { CONFIG_STORAGE_KEY, type ExtensionConfig, SERVICES_STORAGE_KEY } from '../types'
import { normalizeScriptKey } from './extension-services'
import {
  countMatchingRules,
  ensureExtensionServicesState,
  getEnabledScriptKeys,
  loadMergedRules,
  loadScriptKeyRules,
  resolveOtaEndpoint,
  SCRIPT_ENABLED_PREFIX,
  SCRIPTKEY_RULES_PREFIX,
  serviceProfileToExtensionConfig,
} from './extension-storage'

/** Persisted tab-match counts per URL, bucketed by scriptKey. */
export const TAB_MATCH_CACHE_KEY = 'vws_tab_match_cache'

/** Prefer cache within this window; older entries still shown until rules/sync invalidate. */
export const TAB_MATCH_CACHE_TTL_MS = 30 * 60 * 1000

interface TabMatchCacheEntry {
  count: number
  fetchedAt: number
}

interface TabMatchCacheBlobV1 {
  scope: string
  entries: Record<string, TabMatchCacheEntry>
}

interface TabMatchCacheBlobV2 {
  version: 2
  byScriptKey: Record<string, Record<string, TabMatchCacheEntry>>
}

type TabMatchCacheBlob = TabMatchCacheBlobV1 | TabMatchCacheBlobV2

const memory = new Map<string, TabMatchCacheEntry>()
const refreshInflight = new Map<string, Promise<number>>()

function scriptKeyScope(scriptKey: string): string {
  return normalizeScriptKey(scriptKey)
}

function entryKey(scriptKey: string, url: string): string {
  return `${scriptKeyScope(scriptKey)}|${url}`
}

function isFresh(fetchedAt: number, now = Date.now()): boolean {
  return now - fetchedAt < TAB_MATCH_CACHE_TTL_MS
}

function isV2Blob(blob: TabMatchCacheBlob | undefined): blob is TabMatchCacheBlobV2 {
  return !!blob && typeof blob === 'object' && (blob as TabMatchCacheBlobV2).version === 2
}

function readMemoryEntry(scriptKey: string, url: string): TabMatchCacheEntry | undefined {
  return memory.get(entryKey(scriptKey, url))
}

function writeMemoryEntry(scriptKey: string, url: string, entry: TabMatchCacheEntry): void {
  memory.set(entryKey(scriptKey, url), entry)
}

async function readStorageBlob(): Promise<TabMatchCacheBlob | undefined> {
  const result = await chrome.storage.local.get(TAB_MATCH_CACHE_KEY)
  return result[TAB_MATCH_CACHE_KEY] as TabMatchCacheBlob | undefined
}

async function readStorageEntry(scriptKey: string, url: string): Promise<TabMatchCacheEntry | undefined> {
  const blob = await readStorageBlob()
  if (!blob) {
    return undefined
  }

  const scope = scriptKeyScope(scriptKey)
  if (isV2Blob(blob)) {
    const entry = blob.byScriptKey[scope]?.[url]
    if (!entry || typeof entry.count !== 'number') {
      return undefined
    }
    writeMemoryEntry(scriptKey, url, entry)
    return entry
  }

  if (blob.scope.endsWith(`|${scope}`) || blob.scope === scope) {
    const entry = blob.entries[url]
    if (!entry || typeof entry.count !== 'number') {
      return undefined
    }
    writeMemoryEntry(scriptKey, url, entry)
    return entry
  }

  return undefined
}

/** Memory → chrome.storage.local, any age (like Tampermonkey: use last known value first). */
async function readAnyCachedEntry(scriptKey: string, url: string): Promise<TabMatchCacheEntry | undefined> {
  const mem = readMemoryEntry(scriptKey, url)
  if (mem) {
    return mem
  }
  return readStorageEntry(scriptKey, url)
}

async function writeStorageEntry(scriptKey: string, url: string, entry: TabMatchCacheEntry): Promise<void> {
  writeMemoryEntry(scriptKey, url, entry)
  const scope = scriptKeyScope(scriptKey)
  const blob = await readStorageBlob()
  const byScriptKey = isV2Blob(blob) ? { ...blob.byScriptKey } : ({} as TabMatchCacheBlobV2['byScriptKey'])
  const entries = { ...(byScriptKey[scope] ?? {}) }
  entries[url] = entry
  byScriptKey[scope] = entries
  await chrome.storage.local.set({
    [TAB_MATCH_CACHE_KEY]: { version: 2, byScriptKey } satisfies TabMatchCacheBlobV2,
  })
}

/**
 * Drop cached tab-match counts (rules sync, config change, runtime reset).
 * Do not listen for TAB_MATCH_CACHE_KEY writes — that would clear cache on every save.
 */
export async function invalidateTabMatchCache(): Promise<void> {
  memory.clear()
  refreshInflight.clear()
  await chrome.storage.local.remove(TAB_MATCH_CACHE_KEY)
}

async function resolveConfigForScriptKey(scriptKey: string): Promise<ExtensionConfig | null> {
  const state = await ensureExtensionServicesState()
  const endpoint = resolveOtaEndpoint(scriptKey, state.services)
  return endpoint ? serviceProfileToExtensionConfig(endpoint) : null
}

/**
 * Read cached count only. No network.
 */
export async function readTabMatchCountFromCache(config: ExtensionConfig, url: string): Promise<number | undefined> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 0
  }
  const entry = await readAnyCachedEntry(config.scriptKey, url)
  return entry?.count
}

async function fetchTabMatchFromApi(config: ExtensionConfig, url: string): Promise<number> {
  const apiUrl = `${config.baseUrl}/api/tampermonkey/${encodeURIComponent(config.scriptKey)}/tab-match?url=${encodeURIComponent(url)}`
  const res = await fetch(apiUrl)
  if (!res.ok) {
    throw new Error(`tab-match HTTP ${res.status}`)
  }
  const body = (await res.json()) as { code?: number; data?: { count?: number } }
  if (body.code !== 0 || !body.data || typeof body.data.count !== 'number') {
    throw new Error('Invalid tab-match response')
  }
  return body.data.count
}

/**
 * Fetch from API and persist. Used only from background refresh (deduped).
 */
export async function refreshTabMatchCount(config: ExtensionConfig, url: string): Promise<number> {
  const scriptKey = config.scriptKey
  const now = Date.now()
  try {
    const count = await fetchTabMatchFromApi(config, url)
    await writeStorageEntry(scriptKey, url, { count, fetchedAt: now })
    return count
  } catch {
    const rules = await loadScriptKeyRules(scriptKey)
    const count = countMatchingRules(rules, url)
    await writeStorageEntry(scriptKey, url, { count, fetchedAt: now })
    return count
  }
}

/**
 * Schedule a single in-flight refresh per scriptKey+url (no duplicate API calls).
 */
export function scheduleTabMatchRefresh(config: ExtensionConfig, url: string): void {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }
  const key = entryKey(config.scriptKey, url)
  if (refreshInflight.has(key)) {
    return
  }
  const job = refreshTabMatchCount(config, url).finally(() => {
    refreshInflight.delete(key)
  })
  refreshInflight.set(key, job)
  void job
}

/** Refresh tab-match cache for every enabled scriptKey on the active URL. */
export async function scheduleTabMatchRefreshForEnabledScriptKeys(url: string): Promise<void> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }
  const state = await ensureExtensionServicesState()
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const config = await resolveConfigForScriptKey(scriptKey)
    if (config) {
      scheduleTabMatchRefresh(config, url)
    }
  }
}

/**
 * Popup status: return cached (or local rules) immediately; refresh API in background when stale/missing.
 */
export async function getTabMatchCountImmediate(config: ExtensionConfig, url: string): Promise<number> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 0
  }

  const scriptKey = config.scriptKey
  const cached = await readAnyCachedEntry(scriptKey, url)
  if (cached) {
    if (!isFresh(cached.fetchedAt)) {
      scheduleTabMatchRefresh(config, url)
    }
    return cached.count
  }

  scheduleTabMatchRefresh(config, url)
  const rules = await loadScriptKeyRules(scriptKey)
  return countMatchingRules(rules, url)
}

/**
 * Sum tab-match counts across all enabled scriptKeys (RULE diagnostic; not used for badge).
 */
export async function getMergedTabMatchCount(url: string): Promise<number> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 0
  }

  const state = await ensureExtensionServicesState()
  const scriptKeys = getEnabledScriptKeys(state.services)
  if (scriptKeys.length === 0) {
    const rules = await loadMergedRules()
    return countMatchingRules(rules, url)
  }

  let total = 0
  for (const scriptKey of scriptKeys) {
    const config = await resolveConfigForScriptKey(scriptKey)
    if (config) {
      total += await getTabMatchCountImmediate(config, url)
      continue
    }
    const rules = await loadScriptKeyRules(scriptKey)
    total += countMatchingRules(rules, url)
  }
  return total
}

/**
 * Popup/scripts: cache-first tab-match for RULE diagnostics; schedule API when missing/stale.
 * Extension toolbar badge uses real script triggers (see tab-trigger-badge.ts), not this cache.
 */
export async function getTabMatchCountForBadge(config: ExtensionConfig, url: string): Promise<number> {
  return getTabMatchCountImmediate(config, url)
}

/** @deprecated Use getTabMatchCountImmediate */
export async function resolveTabMatchCount(config: ExtensionConfig, url: string, options?: { force?: boolean; allowStale?: boolean }): Promise<number> {
  if (options?.force) {
    return refreshTabMatchCount(config, url)
  }
  return getTabMatchCountImmediate(config, url)
}

/** Whether storage change should invalidate tab-match cache (never TAB_MATCH_CACHE_KEY itself). */
export function shouldInvalidateTabMatchCache(changes: Record<string, chrome.storage.StorageChange>): boolean {
  const keys = Object.keys(changes)
  return keys.some((k) => k === CONFIG_STORAGE_KEY || k === SERVICES_STORAGE_KEY || k.startsWith(SCRIPT_ENABLED_PREFIX) || k.startsWith(SCRIPTKEY_RULES_PREFIX))
}
