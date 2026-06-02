import { isManagedScriptFilename } from '@shared/managed-script-files'

import type { ExtensionConfig, PageBootstrapConfig } from '../../types'
import { buildScriptKeyBootstrapEntriesFromState, scriptKeyListCacheStorageKey } from '../extension-multi-service-pure'
import { getEnabledScriptKeys, normalizeScriptKey, resolveOtaEndpoint, serviceEndpointKey } from '../extension-services'
import { SCRIPT_LIST_CACHE_KEY, SCRIPT_LIST_STORAGE_KEY } from './constants'
import { fallbackScriptListFromEnabledKeys, fallbackScriptListFromEnabledKeysForScriptKey, loadScriptEnabledMapForScriptKey } from './script-enabled'
import { ensureExtensionServicesState, loadScriptKeyGroupMeta, serviceProfileToExtensionConfig } from './services-state'
import type { ManagedScriptListEntry, ScriptKeyScriptsGroupView, ScriptListCache } from './types'

function scriptListScope(config: ExtensionConfig): string {
  return `${config.baseUrl}|${config.scriptKey}`
}

export function dedupeManagedScriptListByFile(scripts: ManagedScriptListEntry[]): ManagedScriptListEntry[] {
  const byFile = new Map<string, ManagedScriptListEntry>()
  for (const row of scripts) {
    byFile.set(row.file, row)
  }
  return Array.from(byFile.values()).sort((a, b) => a.file.localeCompare(b.file))
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
  return dedupeManagedScriptListByFile(list)
}

/** Read script list cache for a scriptKey capability bucket. */
export async function readScriptKeyListCache(scriptKey: string): Promise<ScriptListCache | null> {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return null
  }

  const scopedKey = scriptKeyListCacheStorageKey(normalized)
  const result = await chrome.storage.local.get([scopedKey, SCRIPT_LIST_CACHE_KEY, SCRIPT_LIST_STORAGE_KEY])
  const raw = result[scopedKey] as ScriptListCache | undefined
  if (raw?.scope && Array.isArray(raw.scripts) && raw.scripts.length > 0) {
    return {
      scope: raw.scope,
      gistUpdatedAt: typeof raw.gistUpdatedAt === 'number' ? raw.gistUpdatedAt : 0,
      scripts: parseManagedScriptRows(raw.scripts),
    }
  }

  const state = await ensureExtensionServicesState()
  const ota = resolveOtaEndpoint(normalized, state.services)
  const legacyGlobal = result[SCRIPT_LIST_CACHE_KEY] as ScriptListCache | undefined
  if (ota && legacyGlobal?.scope === serviceEndpointKey(ota.baseUrl, normalized) && legacyGlobal.scripts?.length) {
    return {
      scope: legacyGlobal.scope,
      gistUpdatedAt: typeof legacyGlobal.gistUpdatedAt === 'number' ? legacyGlobal.gistUpdatedAt : 0,
      scripts: parseManagedScriptRows(legacyGlobal.scripts),
    }
  }

  const legacyList = result[SCRIPT_LIST_STORAGE_KEY]
  const legacyScripts = parseManagedScriptRows(legacyList)
  if (legacyScripts.length > 0 && ota) {
    return { scope: serviceEndpointKey(ota.baseUrl, normalized), gistUpdatedAt: 0, scripts: legacyScripts }
  }

  return null
}

/** Read scoped script list cache from chrome.storage.local. */
export async function readScriptListCache(config: ExtensionConfig): Promise<ScriptListCache | null> {
  if (config.scriptKey) {
    return readScriptKeyListCache(config.scriptKey)
  }
  return null
}

async function writeScriptListCache(config: ExtensionConfig, gistUpdatedAt: number, scripts: ManagedScriptListEntry[]): Promise<void> {
  const cache: ScriptListCache = {
    scope: scriptListScope(config),
    gistUpdatedAt,
    scripts,
  }
  const writes: Record<string, unknown> = { [SCRIPT_LIST_CACHE_KEY]: cache }
  const normalized = normalizeScriptKey(config.scriptKey)
  if (normalized) {
    writes[scriptKeyListCacheStorageKey(normalized)] = cache
  }
  await chrome.storage.local.set(writes)
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
  const scripts = dedupeManagedScriptListByFile(list)
  if (gistUpdatedAt <= 0) {
    try {
      gistUpdatedAt = await fetchScriptListVersion(config)
    } catch {
      gistUpdatedAt = Date.now()
    }
  }
  await writeScriptListCache(config, gistUpdatedAt, scripts)
  return scripts
}

/**
 * Script list for immediate UI: per-scriptKey local cache (or enabled-key fallback). Does not block on network.
 * @param scriptKey Script key capability id
 */
export async function loadManagedScriptListFromCacheForScriptKey(scriptKey: string): Promise<ManagedScriptListEntry[]> {
  const cache = await readScriptKeyListCache(scriptKey)
  if (cache?.scripts.length) {
    return dedupeManagedScriptListByFile(cache.scripts)
  }
  return fallbackScriptListFromEnabledKeysForScriptKey(scriptKey)
}

/**
 * Compare remote Gist version with per-scriptKey cache; fetch full list only when newer.
 * @param scriptKey Script key capability id
 * @returns Updated list when changed, otherwise `null`
 */
export async function syncScriptKeyScriptsListIfNeeded(scriptKey: string): Promise<ManagedScriptListEntry[] | null> {
  const state = await ensureExtensionServicesState()
  const ota = resolveOtaEndpoint(scriptKey, state.services)
  if (!ota) {
    return null
  }
  return syncManagedScriptListIfNeeded(serviceProfileToExtensionConfig(ota))
}

/** Sync script lists for every scriptKey that has at least one enabled Service. */
export async function syncActiveScriptKeyScriptLists(): Promise<void> {
  const groups = await loadScriptKeyGroupMeta()
  for (const group of groups) {
    if (group.active) {
      await syncScriptKeyScriptsListIfNeeded(group.scriptKey)
    }
  }
}

/** Load cached script lists grouped by scriptKey for the Scripts page. */
export async function loadScriptKeyScriptsGroupsFromCache(): Promise<ScriptKeyScriptsGroupView[]> {
  const meta = await loadScriptKeyGroupMeta()
  const groups: ScriptKeyScriptsGroupView[] = []
  for (const row of meta) {
    const scripts = await loadManagedScriptListFromCacheForScriptKey(row.scriptKey)
    groups.push({ ...row, scripts })
  }
  return groups
}

/**
 * Build page-world bootstrap payload for all enabled unique scriptKeys.
 * @param extensionVersion Extension manifest version
 * @returns Bootstrap config or null when no enabled scriptKey
 */
export async function buildPageBootstrapConfig(extensionVersion: string): Promise<PageBootstrapConfig | null> {
  const state = await ensureExtensionServicesState()
  const enabledKeys = getEnabledScriptKeys(state.services)
  if (enabledKeys.length === 0) {
    return null
  }

  const listsByScriptKey: Record<string, { files: string[]; enabledByFile: Record<string, boolean> }> = {}
  for (const scriptKey of enabledKeys) {
    const normalized = normalizeScriptKey(scriptKey)
    const scripts = await loadManagedScriptListFromCacheForScriptKey(normalized)
    const enabledMap = await loadScriptEnabledMapForScriptKey(
      normalized,
      scripts.map((row) => row.file)
    )
    const enabledByFile: Record<string, boolean> = {}
    for (const row of scripts) {
      enabledByFile[row.file] = enabledMap.get(row.file) !== false
    }
    listsByScriptKey[normalized] = { files: scripts.map((row) => row.file), enabledByFile }
  }

  const scriptKeys = buildScriptKeyBootstrapEntriesFromState(state, listsByScriptKey)
  if (scriptKeys.length === 0) {
    return null
  }

  const primary = scriptKeys[0]
  return {
    extensionVersion,
    scriptKeys,
    baseUrl: primary.baseUrl,
    scriptKey: primary.scriptKey,
    developMode: primary.developMode,
  }
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
