import { isManagedScriptFilename } from '@shared/managed-script-files'

import type { ExtensionConfig, PageBootstrapConfig } from '../../types'
import { buildScriptKeyBootstrapEntriesFromState, scriptKeyListCacheStorageKey } from '../extension-multi-service-pure'
import { getEnabledScriptKeys, getPermissionModeForScriptKey, normalizeScriptKey, resolveOtaEndpoint, serviceEndpointKey } from '../extension-services'
import { SCRIPT_LIST_CACHE_KEY, SCRIPT_LIST_STORAGE_KEY } from './constants'
import {
  fallbackScriptListFromEnabledKeys,
  fallbackScriptListFromEnabledKeysForScriptKey,
  loadScriptEnabledMapForScriptKey,
  type ScriptEnabledContextOptions,
  scriptNamesFromEnabledStorageKeysForScriptKey,
  scriptNamesFromIncognitoEnabledStorageKeysForScriptKey,
} from './script-enabled'
import { loadScriptInstalledMapForScriptKey, reconcileUninstalledScriptsAfterListRefresh } from './script-installed'
import { ensureExtensionServicesState, loadScriptKeyGroupMeta, serviceProfileToExtensionConfig } from './services-state'
import type { ManagedScriptListEntry, ScriptKeyScriptsGroupView, ScriptListCache } from './types'

/** Increment when {@link ManagedScriptListEntry} / scripts API display fields change. */
export const SCRIPT_LIST_META_SCHEMA = 2

function scriptListScope(config: ExtensionConfig): string {
  return `${config.baseUrl}|${config.scriptKey}`
}

function resolveScriptListUpdatedAtFallback(gistUpdatedAt: number): number | undefined {
  return typeof gistUpdatedAt === 'number' && Number.isFinite(gistUpdatedAt) && gistUpdatedAt > 0 ? gistUpdatedAt : undefined
}

/**
 * Fill missing per-script `updatedAt` from gist-level revision time (legacy caches / API rows without the field).
 */
export function enrichManagedScriptListWithUpdatedAt(scripts: ManagedScriptListEntry[], gistUpdatedAt: number): ManagedScriptListEntry[] {
  const fallback = resolveScriptListUpdatedAtFallback(gistUpdatedAt)
  if (!fallback) {
    return scripts
  }

  return scripts.map((row) => {
    if (typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) && row.updatedAt > 0) {
      return row
    }
    return { ...row, updatedAt: fallback }
  })
}

function managedScriptListNeedsUpdatedAtRefresh(scripts: ManagedScriptListEntry[]): boolean {
  return scripts.some((row) => !(typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) && row.updatedAt > 0))
}

/** Whether a persisted list cache predates current display metadata fields. */
export function scriptListCacheNeedsMetaRefresh(cache: ScriptListCache | null): boolean {
  if (!cache?.scripts.length) {
    return false
  }
  return (cache.metaSchema ?? 1) < SCRIPT_LIST_META_SCHEMA
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
    const descriptionRaw = (row as ManagedScriptListEntry).description
    const iconRaw = (row as ManagedScriptListEntry).icon
    const versionRaw = (row as ManagedScriptListEntry).version
    const authorRaw = (row as ManagedScriptListEntry).author
    const contentHashRaw = (row as ManagedScriptListEntry).contentHash
    const description = typeof descriptionRaw === 'string' && descriptionRaw.trim() ? descriptionRaw.trim() : undefined
    const icon = typeof iconRaw === 'string' && iconRaw.trim() ? iconRaw.trim() : undefined
    const version = typeof versionRaw === 'string' && versionRaw.trim() ? versionRaw.trim() : undefined
    const author = typeof authorRaw === 'string' && authorRaw.trim() ? authorRaw.trim() : undefined
    const contentHash = typeof contentHashRaw === 'string' && contentHashRaw.trim() ? contentHashRaw.trim() : undefined
    const updatedAtRaw = (row as ManagedScriptListEntry).updatedAt
    const updatedAt = typeof updatedAtRaw === 'number' && Number.isFinite(updatedAtRaw) ? updatedAtRaw : undefined
    list.push({
      file,
      name,
      ...(description ? { description } : {}),
      ...(icon ? { icon } : {}),
      ...(version ? { version } : {}),
      ...(author ? { author } : {}),
      ...(contentHash ? { contentHash } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    })
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
    const gistUpdatedAt = typeof raw.gistUpdatedAt === 'number' ? raw.gistUpdatedAt : 0
    const metaSchema = typeof raw.metaSchema === 'number' ? raw.metaSchema : 1
    return {
      scope: raw.scope,
      gistUpdatedAt,
      metaSchema,
      scripts: enrichManagedScriptListWithUpdatedAt(parseManagedScriptRows(raw.scripts), gistUpdatedAt),
    }
  }

  const state = await ensureExtensionServicesState()
  const ota = resolveOtaEndpoint(normalized, state.services)
  const legacyGlobal = result[SCRIPT_LIST_CACHE_KEY] as ScriptListCache | undefined
  if (ota && legacyGlobal?.scope === serviceEndpointKey(ota.baseUrl, normalized) && legacyGlobal.scripts?.length) {
    const gistUpdatedAt = typeof legacyGlobal.gistUpdatedAt === 'number' ? legacyGlobal.gistUpdatedAt : 0
    const metaSchema = typeof legacyGlobal.metaSchema === 'number' ? legacyGlobal.metaSchema : 1
    return {
      scope: legacyGlobal.scope,
      gistUpdatedAt,
      metaSchema,
      scripts: enrichManagedScriptListWithUpdatedAt(parseManagedScriptRows(legacyGlobal.scripts), gistUpdatedAt),
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
    metaSchema: SCRIPT_LIST_META_SCHEMA,
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
    data?:
      | {
          scripts?: Array<{
            file?: string
            name?: string
            description?: string
            icon?: string
            version?: string
            author?: string
            contentHash?: string
            updatedAt?: number
          }>
          gistUpdatedAt?: number
        }
      | Array<{
          file?: string
          name?: string
          description?: string
          icon?: string
          version?: string
          author?: string
          contentHash?: string
          updatedAt?: number
        }>
  }
  if (body.code !== 0 || !body.data) {
    throw new Error('Invalid scripts API response')
  }

  let rows: Array<{
    file?: string
    name?: string
    description?: string
    icon?: string
    version?: string
    author?: string
    contentHash?: string
    updatedAt?: number
  }>
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
    const description = typeof row.description === 'string' && row.description.trim() ? row.description.trim() : undefined
    const icon = typeof row.icon === 'string' && row.icon.trim() ? row.icon.trim() : undefined
    const version = typeof row.version === 'string' && row.version.trim() ? row.version.trim() : undefined
    const author = typeof row.author === 'string' && row.author.trim() ? row.author.trim() : undefined
    const contentHash = typeof row.contentHash === 'string' && row.contentHash.trim() ? row.contentHash.trim() : undefined
    const apiUpdatedAt = typeof row.updatedAt === 'number' && Number.isFinite(row.updatedAt) && row.updatedAt > 0 ? row.updatedAt : undefined
    list.push({
      file: row.file,
      name,
      ...(description ? { description } : {}),
      ...(icon ? { icon } : {}),
      ...(version ? { version } : {}),
      ...(author ? { author } : {}),
      ...(contentHash ? { contentHash } : {}),
      ...(apiUpdatedAt !== undefined ? { updatedAt: apiUpdatedAt } : {}),
    })
  }
  let scripts = dedupeManagedScriptListByFile(list)
  if (gistUpdatedAt <= 0) {
    try {
      gistUpdatedAt = await fetchScriptListVersion(config)
    } catch {
      gistUpdatedAt = Date.now()
    }
  }
  scripts = enrichManagedScriptListWithUpdatedAt(scripts, gistUpdatedAt)
  await writeScriptListCache(config, gistUpdatedAt, scripts)
  await reconcileUninstalledScriptsAfterListRefresh(config.scriptKey, scripts)
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

/**
 * Force-refresh managed script lists for all enabled scriptKeys (e.g. after Update runtime).
 * Writes full display metadata to chrome.storage when the API succeeds.
 */
export async function refreshScriptListsForEnabledScriptKeys(): Promise<void> {
  const state = await ensureExtensionServicesState()
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const ota = resolveOtaEndpoint(scriptKey, state.services)
    if (!ota?.baseUrl || !ota.scriptKey) {
      continue
    }
    try {
      const scripts = await fetchManagedScriptList(serviceProfileToExtensionConfig(ota))
      await reconcileUninstalledScriptsAfterListRefresh(scriptKey, scripts)
    } catch {
      /* keep existing cache when offline or API errors */
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
 * Popup subtitle counts: enabled Servers rows and Manage-scripts toggles on across their scriptKeys.
 * @returns Enabled server count and enabled script file count (deduped per scriptKey, not per server row)
 */
export async function countEnabledScriptsForEnabledScriptKeys(options?: ScriptEnabledContextOptions): Promise<{ serverCount: number; enabledScriptCount: number }> {
  const state = await ensureExtensionServicesState()
  const enabledKeys = getEnabledScriptKeys(state.services)
  const serverCount = state.services.filter((service) => service.enabled).length
  let enabledScriptCount = 0
  for (const scriptKey of enabledKeys) {
    const normalized = normalizeScriptKey(scriptKey)
    const scripts = await loadManagedScriptListFromCacheForScriptKey(normalized)
    const enabledMap = await loadScriptEnabledMapForScriptKey(
      normalized,
      scripts.map((row) => row.file),
      options
    )
    const installedMap = await loadScriptInstalledMapForScriptKey(
      normalized,
      scripts.map((row) => row.file),
      new Map(scripts.map((row) => [row.file, row.contentHash]))
    )
    for (const row of scripts) {
      if (installedMap.get(row.file) !== false && enabledMap.get(row.file) !== false) {
        enabledScriptCount += 1
      }
    }
  }
  return { serverCount, enabledScriptCount }
}

/**
 * Build page-world bootstrap payload for all enabled unique scriptKeys.
 * @param extensionVersion Extension manifest version
 * @returns Bootstrap config or null when no enabled scriptKey
 */
export async function buildPageBootstrapConfig(extensionVersion: string, options?: ScriptEnabledContextOptions): Promise<PageBootstrapConfig | null> {
  const state = await ensureExtensionServicesState()
  const enabledKeys = getEnabledScriptKeys(state.services)
  if (enabledKeys.length === 0) {
    return null
  }

  const incognito = options?.incognito === true
  const listsByScriptKey: Record<string, { files: string[]; enabledByFile: Record<string, boolean> }> = {}
  const allStorageKeys = Object.keys(await chrome.storage.local.get(null))
  for (const scriptKey of enabledKeys) {
    const normalized = normalizeScriptKey(scriptKey)
    const scripts = await loadManagedScriptListFromCacheForScriptKey(normalized)
    const storageToggledFiles = scriptNamesFromEnabledStorageKeysForScriptKey(normalized, allStorageKeys)
    const incognitoToggledFiles = incognito ? scriptNamesFromIncognitoEnabledStorageKeysForScriptKey(normalized, allStorageKeys) : []
    const filesForEnabledRead = [...new Set([...scripts.map((row) => row.file), ...storageToggledFiles, ...incognitoToggledFiles])]
    const enabledMap = await loadScriptEnabledMapForScriptKey(normalized, filesForEnabledRead, options)
    const scriptContentHashByFile = new Map(scripts.map((row) => [row.file, row.contentHash]))
    const installedMap = await loadScriptInstalledMapForScriptKey(normalized, filesForEnabledRead, scriptContentHashByFile)
    const enabledByFile: Record<string, boolean> = {}
    for (const file of filesForEnabledRead) {
      const installed = installedMap.get(file) !== false
      const enabled = enabledMap.get(file) !== false
      enabledByFile[file] = installed && enabled
    }
    const contentHashByFile: Record<string, string> = {}
    for (const row of scripts) {
      if (row.contentHash) {
        contentHashByFile[row.file] = row.contentHash
      }
    }
    listsByScriptKey[normalized] = {
      files: scripts.map((row) => row.file),
      enabledByFile,
      ...(Object.keys(contentHashByFile).length > 0 ? { contentHashByFile } : {}),
    }
  }

  const scriptKeys = buildScriptKeyBootstrapEntriesFromState(state, listsByScriptKey)
  if (scriptKeys.length === 0) {
    return null
  }

  const primary = scriptKeys[0]
  const permissionTrustScriptKeys = enabledKeys
    .map((scriptKey) => normalizeScriptKey(scriptKey))
    .filter((scriptKey) => getPermissionModeForScriptKey(scriptKey, state.scriptKeyMeta) === 'trust')
  return {
    extensionVersion,
    scriptKeys,
    ...(permissionTrustScriptKeys.length > 0 ? { permissionTrustScriptKeys } : {}),
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
    const unchangedRevision = Boolean(cache && cache.gistUpdatedAt > 0 && remoteVersion === cache.gistUpdatedAt)
    const needsUpdatedAtRefresh = cache ? managedScriptListNeedsUpdatedAtRefresh(cache.scripts) : false
    const needsMetaRefresh = scriptListCacheNeedsMetaRefresh(cache)
    if (unchangedRevision && !needsUpdatedAtRefresh && !needsMetaRefresh) {
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
