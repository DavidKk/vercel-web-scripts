import {
  LEGACY_AUTO_UPDATE_SCRIPT_KEY,
  MODULE_MANIFEST_ETAG_KEY,
  PRESET_ACTIVATED_HASH_KEY,
  PRESET_CACHE_KEY,
  PRESET_ETAG_KEY,
  PRESET_PREVIOUS_HASH_KEY,
  PRESET_UPDATE_CHANNEL_KEY,
  PRESET_UPDATED_NOTIFY_KEY,
  RUNTIME_STATE_KEY_PREFIX,
  SCRIPT_BUNDLE_URL_KEY,
  SHELL_NETWORK_ENABLED_KEY,
} from '@shared/launcher-constants'
import { isManagedScriptFilename } from '@shared/managed-script-files'

import type { ExtensionConfig } from '../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types'
import { matchUrl } from './match-url'

export const RULES_STORAGE_KEY = 'vws_extension_rules'
export const GM_STORAGE_PREFIX = 'vws_gm_'
export const SCRIPT_ENABLED_PREFIX = 'vws_script_enabled:'
/** @deprecated Migrated to {@link SCRIPT_LIST_CACHE_KEY} */
export const SCRIPT_LIST_STORAGE_KEY = 'vws_extension_script_list'

export const SCRIPT_LIST_CACHE_KEY = 'vws_extension_script_list_cache'

export interface ManagedScriptListEntry {
  file: string
  name: string
}

export interface ScriptListCache {
  /** `${baseUrl}|${scriptKey}` — invalidates cache when Options change */
  scope: string
  gistUpdatedAt: number
  scripts: ManagedScriptListEntry[]
}

function scriptListScope(config: ExtensionConfig): string {
  return `${config.baseUrl}|${config.scriptKey}`
}

function parseManagedScriptRows(data: unknown): ManagedScriptListEntry[] {
  if (!Array.isArray(data)) {
    return []
  }
  const list: ManagedScriptListEntry[] = []
  for (const row of data) {
    if (!row || typeof row !== 'object') {
      continue
    }
    const file = (row as ManagedScriptListEntry).file
    if (typeof file !== 'string' || !isManagedScriptFilename(file)) {
      continue
    }
    const name = typeof (row as ManagedScriptListEntry).name === 'string' ? (row as ManagedScriptListEntry).name : file
    list.push({ file, name })
  }
  list.sort((a, b) => a.file.localeCompare(b.file))
  return list
}

/** Read scoped script list cache from chrome.storage.local. */
export async function readScriptListCache(config: ExtensionConfig): Promise<ScriptListCache | null> {
  const scope = scriptListScope(config)
  const result = await chrome.storage.local.get([SCRIPT_LIST_CACHE_KEY, SCRIPT_LIST_STORAGE_KEY])
  const raw = result[SCRIPT_LIST_CACHE_KEY] as ScriptListCache | undefined
  if (raw?.scope === scope && Array.isArray(raw.scripts) && raw.scripts.length > 0) {
    return {
      scope: raw.scope,
      gistUpdatedAt: typeof raw.gistUpdatedAt === 'number' ? raw.gistUpdatedAt : 0,
      scripts: parseManagedScriptRows(raw.scripts),
    }
  }

  const legacy = result[SCRIPT_LIST_STORAGE_KEY]
  const scripts = parseManagedScriptRows(legacy)
  if (scripts.length === 0) {
    return null
  }
  return { scope, gistUpdatedAt: 0, scripts }
}

async function writeScriptListCache(config: ExtensionConfig, gistUpdatedAt: number, scripts: ManagedScriptListEntry[]): Promise<void> {
  const cache: ScriptListCache = {
    scope: scriptListScope(config),
    gistUpdatedAt,
    scripts,
  }
  await chrome.storage.local.set({ [SCRIPT_LIST_CACHE_KEY]: cache })
}

/** Remote Gist revision (epoch ms) for cache invalidation. */
export async function fetchScriptListVersion(config: ExtensionConfig): Promise<number> {
  const url = `${config.baseUrl}/api/tampermonkey/${encodeURIComponent(config.scriptKey)}/scripts/version`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Scripts version API HTTP ${res.status}`)
  }
  const body = (await res.json()) as { code?: number; data?: { gistUpdatedAt?: number } }
  if (body.code !== 0 || typeof body.data?.gistUpdatedAt !== 'number') {
    throw new Error('Invalid scripts version API response')
  }
  return body.data.gistUpdatedAt
}

/** Fetch full script list from server and persist cache. */
export async function fetchManagedScriptList(config: ExtensionConfig): Promise<ManagedScriptListEntry[]> {
  const url = `${config.baseUrl}/api/tampermonkey/${encodeURIComponent(config.scriptKey)}/scripts`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Scripts API HTTP ${res.status}`)
  }
  const body = (await res.json()) as {
    code?: number
    data?: { scripts?: Array<{ file?: string; name?: string }>; gistUpdatedAt?: number } | Array<{ file?: string; name?: string }>
  }
  if (body.code !== 0 || !body.data) {
    throw new Error('Invalid scripts API response')
  }

  let rows: Array<{ file?: string; name?: string }>
  let gistUpdatedAt = 0
  if (Array.isArray(body.data)) {
    rows = body.data
  } else {
    rows = body.data.scripts ?? []
    gistUpdatedAt = typeof body.data.gistUpdatedAt === 'number' ? body.data.gistUpdatedAt : 0
  }

  const list: ManagedScriptListEntry[] = []
  for (const row of rows) {
    if (!row?.file || !isManagedScriptFilename(row.file)) {
      continue
    }
    const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : row.file
    list.push({ file: row.file, name })
  }
  list.sort((a, b) => a.file.localeCompare(b.file))
  if (gistUpdatedAt <= 0) {
    try {
      gistUpdatedAt = await fetchScriptListVersion(config)
    } catch {
      gistUpdatedAt = Date.now()
    }
  }
  await writeScriptListCache(config, gistUpdatedAt, list)
  return list
}

function fallbackScriptListFromEnabledKeys(): Promise<ManagedScriptListEntry[]> {
  return chrome.storage.local.get(null).then((all) => scriptNamesFromEnabledStorageKeys(Object.keys(all)).map((file) => ({ file, name: file })))
}

/**
 * Script list for immediate UI: local cache (or enabled-key fallback). Does not block on network.
 */
export async function loadManagedScriptListFromCache(config: ExtensionConfig): Promise<ManagedScriptListEntry[]> {
  const cache = await readScriptListCache(config)
  if (cache?.scripts.length) {
    return cache.scripts
  }
  return fallbackScriptListFromEnabledKeys()
}

/**
 * Compare remote Gist version with cache; fetch full list only when newer. Returns `null` if unchanged or on version check failure.
 */
export async function syncManagedScriptListIfNeeded(config: ExtensionConfig): Promise<ManagedScriptListEntry[] | null> {
  if (!config.baseUrl || !config.scriptKey) {
    return null
  }

  const cache = await readScriptListCache(config)
  try {
    const remoteVersion = await fetchScriptListVersion(config)
    if (cache && cache.gistUpdatedAt > 0 && remoteVersion === cache.gistUpdatedAt) {
      return null
    }
    return await fetchManagedScriptList(config)
  } catch {
    return null
  }
}

/** @deprecated Use {@link loadManagedScriptListFromCache} + {@link syncManagedScriptListIfNeeded} */
export async function loadManagedScriptList(config: ExtensionConfig): Promise<ManagedScriptListEntry[]> {
  const cached = await loadManagedScriptListFromCache(config)
  if (!config.baseUrl || !config.scriptKey) {
    return cached
  }
  const fresh = await syncManagedScriptListIfNeeded(config)
  return fresh ?? cached
}

export interface ExtensionRuleEntry {
  id: string
  wildcard: string
  script: string
  enabled: boolean
}

export function gmStorageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
}

export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY)
  const raw = result[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined
  if (raw?.baseUrl && raw?.scriptKey) {
    return { ...DEFAULT_CONFIG, ...raw, baseUrl: raw.baseUrl.replace(/\/$/, ''), scriptKey: raw.scriptKey.trim() }
  }
  return { ...DEFAULT_CONFIG }
}

export async function loadExtensionRules(): Promise<ExtensionRuleEntry[]> {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY)
  const raw = result[RULES_STORAGE_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter(
    (r): r is ExtensionRuleEntry =>
      r &&
      typeof r === 'object' &&
      typeof (r as ExtensionRuleEntry).id === 'string' &&
      typeof (r as ExtensionRuleEntry).wildcard === 'string' &&
      typeof (r as ExtensionRuleEntry).script === 'string'
  )
}

export function countMatchingRules(rules: ExtensionRuleEntry[], url: string): number {
  return rules.filter((r) => r.enabled !== false && r.wildcard && matchUrl(r.wildcard, url)).length
}

export function shouldInjectOnUrl(rules: ExtensionRuleEntry[], url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false
  }
  if (rules.length === 0) {
    return true
  }
  return countMatchingRules(rules, url) > 0
}

function scriptNamesFromEnabledStorageKeys(storageKeys: string[]): string[] {
  const names = new Set<string>()
  for (const key of storageKeys) {
    if (!key.startsWith(SCRIPT_ENABLED_PREFIX)) {
      continue
    }
    const file = key.slice(SCRIPT_ENABLED_PREFIX.length)
    if (isManagedScriptFilename(file)) {
      names.add(file)
    }
  }
  return Array.from(names).sort()
}

export async function isScriptEnabled(scriptName: string): Promise<boolean> {
  const map = await loadScriptEnabledMap([scriptName])
  return map.get(scriptName) !== false
}

/** Batch-read `vws_script_enabled:*` for many script names (default enabled when unset). */
export async function loadScriptEnabledMap(scriptNames: string[]): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }
  const keys = scriptNames.map((name) => `${SCRIPT_ENABLED_PREFIX}${name}`)
  const result = await chrome.storage.local.get(keys)
  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const key = `${SCRIPT_ENABLED_PREFIX}${name}`
    map.set(name, result[key] !== false)
  }
  return map
}

export async function setScriptEnabled(scriptName: string, enabled: boolean): Promise<void> {
  const key = `${SCRIPT_ENABLED_PREFIX}${scriptName}`
  await chrome.storage.local.set({ [key]: enabled })
}

export async function getShellNetworkEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(gmStorageKey(SHELL_NETWORK_ENABLED_KEY))
  const v = result[gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]
  if (v === true) {
    return true
  }
  if (v === false) {
    return false
  }
  const legacy = await chrome.storage.local.get(gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY))
  return legacy[gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)] === true
}

export async function setShellNetworkEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]: enabled })
}

function scopedKeys(config: ExtensionConfig): string[] {
  const scope = encodeURIComponent(`${config.baseUrl}|${config.scriptKey}`)
  return [
    `${PRESET_CACHE_KEY}:${scope}`,
    `${PRESET_ETAG_KEY}:${scope}`,
    `${PRESET_UPDATED_NOTIFY_KEY}:${scope}`,
    `${PRESET_ACTIVATED_HASH_KEY}:${scope}`,
    `${PRESET_PREVIOUS_HASH_KEY}:${scope}`,
    `${MODULE_MANIFEST_ETAG_KEY}:${scope}`,
    `${SCRIPT_BUNDLE_URL_KEY}:${scope}`,
  ]
}

/** Clear module cache and signal update (MVP update runtime). */
export async function clearRuntimeModuleCache(config: ExtensionConfig): Promise<void> {
  const keysToRemove = [
    ...scopedKeys(config),
    PRESET_CACHE_KEY,
    PRESET_ETAG_KEY,
    PRESET_ACTIVATED_HASH_KEY,
    PRESET_PREVIOUS_HASH_KEY,
    MODULE_MANIFEST_ETAG_KEY,
    SCRIPT_BUNDLE_URL_KEY,
  ]
  const gmRemoves: string[] = []
  for (const k of keysToRemove) {
    gmRemoves.push(gmStorageKey(k))
  }
  await chrome.storage.local.remove([...keysToRemove, ...gmRemoves])
  await chrome.storage.local.set({ [gmStorageKey(PRESET_UPDATE_CHANNEL_KEY)]: Date.now() })
}

/** Reset runtime state keys while keeping extension config and rules. */
export async function resetRuntimeState(config: ExtensionConfig): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const network = all[gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]
  const legacy = all[gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]
  const toRemove: string[] = []
  for (const key of Object.keys(all)) {
    if (key === CONFIG_STORAGE_KEY || key === RULES_STORAGE_KEY) {
      continue
    }
    if (key.startsWith(SCRIPT_ENABLED_PREFIX)) {
      continue
    }
    if (key.startsWith(RUNTIME_STATE_KEY_PREFIX) || key.startsWith(GM_STORAGE_PREFIX)) {
      toRemove.push(key)
    }
  }
  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove)
  }
  await chrome.storage.local.set({
    [gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]: network === true || network === false ? network : true,
  })
  if (legacy === true || legacy === false) {
    await chrome.storage.local.set({ [gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]: legacy })
  }
  await clearRuntimeModuleCache(config)
}

export async function syncRulesFromServer(config: ExtensionConfig): Promise<ExtensionRuleEntry[]> {
  const url = `${config.baseUrl}/api/tampermonkey/${encodeURIComponent(config.scriptKey)}/rule`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Rules API HTTP ${res.status}`)
  }
  const body = (await res.json()) as { code?: number; data?: Array<{ id: string; wildcard: string; script: string }> }
  if (body.code !== 0 || !Array.isArray(body.data)) {
    throw new Error('Invalid rules API response')
  }
  const rules: ExtensionRuleEntry[] = body.data.map((r) => ({
    id: r.id,
    wildcard: r.wildcard,
    script: r.script,
    enabled: true,
  }))
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules })
  const { invalidateTabMatchCache } = await import('./tab-match-cache')
  await invalidateTabMatchCache()
  return rules
}
