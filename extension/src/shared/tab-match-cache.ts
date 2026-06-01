import { CONFIG_STORAGE_KEY, type ExtensionConfig } from '../types'
import { countMatchingRules, loadExtensionRules, RULES_STORAGE_KEY, SCRIPT_ENABLED_PREFIX } from './extension-storage'

/** Persisted tab-match counts per URL (scoped by baseUrl + scriptKey). */
export const TAB_MATCH_CACHE_KEY = 'vws_tab_match_cache'

/** Prefer cache within this window; older entries still shown until rules/sync invalidate. */
export const TAB_MATCH_CACHE_TTL_MS = 30 * 60 * 1000

interface TabMatchCacheEntry {
  count: number
  fetchedAt: number
}

interface TabMatchCacheBlob {
  scope: string
  entries: Record<string, TabMatchCacheEntry>
}

const memory = new Map<string, TabMatchCacheEntry>()
const refreshInflight = new Map<string, Promise<number>>()

function scopeKey(config: ExtensionConfig): string {
  return `${config.baseUrl}|${config.scriptKey}`
}

function entryKey(scope: string, url: string): string {
  return `${scope}|${url}`
}

function isFresh(fetchedAt: number, now = Date.now()): boolean {
  return now - fetchedAt < TAB_MATCH_CACHE_TTL_MS
}

function readMemoryEntry(scope: string, url: string): TabMatchCacheEntry | undefined {
  return memory.get(entryKey(scope, url))
}

function writeMemoryEntry(scope: string, url: string, entry: TabMatchCacheEntry): void {
  memory.set(entryKey(scope, url), entry)
}

async function readStorageEntry(scope: string, url: string): Promise<TabMatchCacheEntry | undefined> {
  const result = await chrome.storage.local.get(TAB_MATCH_CACHE_KEY)
  const blob = result[TAB_MATCH_CACHE_KEY] as TabMatchCacheBlob | undefined
  if (!blob || blob.scope !== scope) {
    return undefined
  }
  const entry = blob.entries[url]
  if (!entry || typeof entry.count !== 'number') {
    return undefined
  }
  writeMemoryEntry(scope, url, entry)
  return entry
}

/** Memory → chrome.storage.local, any age (like Tampermonkey: use last known value first). */
async function readAnyCachedEntry(scope: string, url: string): Promise<TabMatchCacheEntry | undefined> {
  const mem = readMemoryEntry(scope, url)
  if (mem) {
    return mem
  }
  return readStorageEntry(scope, url)
}

async function writeStorageEntry(scope: string, url: string, entry: TabMatchCacheEntry): Promise<void> {
  writeMemoryEntry(scope, url, entry)
  const result = await chrome.storage.local.get(TAB_MATCH_CACHE_KEY)
  const prev = result[TAB_MATCH_CACHE_KEY] as TabMatchCacheBlob | undefined
  const entries = prev && prev.scope === scope ? { ...prev.entries } : ({} as TabMatchCacheBlob['entries'])
  entries[url] = entry
  await chrome.storage.local.set({
    [TAB_MATCH_CACHE_KEY]: { scope, entries } satisfies TabMatchCacheBlob,
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

/**
 * Read cached count only. No network.
 */
export async function readTabMatchCountFromCache(config: ExtensionConfig, url: string): Promise<number | undefined> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 0
  }
  const entry = await readAnyCachedEntry(scopeKey(config), url)
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
  const scope = scopeKey(config)
  const now = Date.now()
  try {
    const count = await fetchTabMatchFromApi(config, url)
    await writeStorageEntry(scope, url, { count, fetchedAt: now })
    return count
  } catch {
    const rules = await loadExtensionRules()
    const count = countMatchingRules(rules, url)
    await writeStorageEntry(scope, url, { count, fetchedAt: now })
    return count
  }
}

/**
 * Schedule a single in-flight refresh per scope+url (no duplicate API calls).
 */
export function scheduleTabMatchRefresh(config: ExtensionConfig, url: string): void {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }
  const key = entryKey(scopeKey(config), url)
  if (refreshInflight.has(key)) {
    return
  }
  const job = refreshTabMatchCount(config, url).finally(() => {
    refreshInflight.delete(key)
  })
  refreshInflight.set(key, job)
  void job
}

/**
 * Popup status: return cached (or local rules) immediately; refresh API in background when stale/missing.
 */
export async function getTabMatchCountImmediate(config: ExtensionConfig, url: string): Promise<number> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 0
  }

  const scope = scopeKey(config)
  const cached = await readAnyCachedEntry(scope, url)
  if (cached) {
    if (!isFresh(cached.fetchedAt)) {
      scheduleTabMatchRefresh(config, url)
    }
    return cached.count
  }

  scheduleTabMatchRefresh(config, url)
  const rules = await loadExtensionRules()
  return countMatchingRules(rules, url)
}

/**
 * Popup/scripts: cache-first tab-match for RULE diagnostics; schedule API when missing/stale.
 * Extension toolbar badge uses real script triggers (see tab-trigger-badge.ts), not this cache.
 * Same model as Tampermonkey — no special CSR / SPA handling at the shell layer.
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
  return keys.some((k) => k === CONFIG_STORAGE_KEY || k === RULES_STORAGE_KEY || k.startsWith(SCRIPT_ENABLED_PREFIX))
}
