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

import type { ExtensionConfig, ExtensionServicesState, PageBootstrapConfig, ServiceProfile } from '../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, SERVICES_MIGRATION_FLAG_KEY, SERVICES_STORAGE_KEY } from '../types'
import {
  buildScriptKeyBootstrapEntriesFromState,
  buildScriptKeyGroupMetaFromState,
  SCRIPT_ENABLED_PREFIX,
  scriptEnabledStorageKey,
  SCRIPTKEY_RULES_PREFIX,
  type ScriptKeyGroupMeta,
  scriptKeyListCacheStorageKey,
  scriptKeyRulesStorageKey,
} from './extension-multi-service-pure'
import {
  countServiceRefs,
  createServiceId,
  defaultGmScopeFromLabel,
  defaultLabelFromBaseUrl,
  ensureScriptKeyMetaEntry,
  findServiceByEndpoint,
  getEnabledScriptKeys,
  getGmScopeForScriptKey,
  normalizeBaseUrl,
  normalizeExtensionServicesState,
  normalizeScriptKey,
  resolveDevelopService,
  resolveOtaEndpoint,
  serviceEndpointKey,
} from './extension-services'
import { matchUrl } from './match-url'

export type { ScriptKeyGroupMeta } from './extension-multi-service-pure'
export {
  buildScriptKeyBootstrapEntriesFromState,
  buildScriptKeyGroupMetaFromState,
  parseScriptEnabledStorageKey,
  SCRIPT_ENABLED_PREFIX,
  scriptEnabledStorageKey,
  SCRIPTKEY_LIST_CACHE_PREFIX,
  SCRIPTKEY_RULES_PREFIX,
  scriptKeyListCacheStorageKey,
  scriptKeyRulesStorageKey,
} from './extension-multi-service-pure'
export { countServiceRefs, getEnabledScriptKeys, isValidScriptKeyFormat, resolveDevelopService, resolveOtaEndpoint } from './extension-services'

/** @deprecated Migrated to {@link SCRIPTKEY_RULES_PREFIX}{scriptKey} buckets. */
export const RULES_STORAGE_KEY = 'vws_extension_rules'
export const GM_STORAGE_PREFIX = 'vws_gm_'
/** @deprecated Migrated to {@link SCRIPT_LIST_CACHE_KEY} */
export const SCRIPT_LIST_STORAGE_KEY = 'vws_extension_script_list'

export const SCRIPT_LIST_CACHE_KEY = 'vws_extension_script_list_cache'

export interface UpsertServiceInput {
  label?: string
  baseUrl: string
  scriptKey: string
  enabled?: boolean
  developMode?: boolean
}

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

function fallbackScriptListFromEnabledKeysForScriptKey(scriptKey: string): Promise<ManagedScriptListEntry[]> {
  const normalized = normalizeScriptKey(scriptKey)
  return chrome.storage.local.get(null).then((all) => scriptNamesFromEnabledStorageKeysForScriptKey(normalized, Object.keys(all)).map((file) => ({ file, name: file })))
}

/**
 * Script list for immediate UI: per-scriptKey local cache (or enabled-key fallback). Does not block on network.
 * @param scriptKey Script key capability id
 */
export async function loadManagedScriptListFromCacheForScriptKey(scriptKey: string): Promise<ManagedScriptListEntry[]> {
  const cache = await readScriptKeyListCache(scriptKey)
  if (cache?.scripts.length) {
    return cache.scripts
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

export interface ScriptKeyScriptsGroupView extends ScriptKeyGroupMeta {
  scripts: ManagedScriptListEntry[]
}

/**
 * Unique scriptKeys in Service list order (deduped), with associated Service labels.
 */
export async function loadScriptKeyGroupMeta(): Promise<ScriptKeyGroupMeta[]> {
  const state = await ensureExtensionServicesState()
  return buildScriptKeyGroupMetaFromState(state)
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

export interface ExtensionRuleEntry {
  id: string
  wildcard: string
  script: string
  enabled: boolean
}

export function gmStorageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
}

let servicesStateCache: ExtensionServicesState | null = null

/**
 * Read multi-service state from chrome.storage.local (no migration).
 * @returns Normalized services state
 */
export async function loadExtensionServicesState(): Promise<ExtensionServicesState> {
  const result = await chrome.storage.local.get(SERVICES_STORAGE_KEY)
  return normalizeExtensionServicesState(result[SERVICES_STORAGE_KEY])
}

/**
 * Persist multi-service state and sync legacy config for transitional readers.
 * @param state Services state to save
 */
export async function saveExtensionServicesState(state: ExtensionServicesState): Promise<void> {
  servicesStateCache = state
  await chrome.storage.local.set({ [SERVICES_STORAGE_KEY]: state })
  await syncLegacyConfigFromServicesState(state)
}

/**
 * Ensure legacy config is migrated and return current services state.
 * @returns Migrated services state
 */
export async function ensureExtensionServicesState(): Promise<ExtensionServicesState> {
  if (servicesStateCache) {
    return servicesStateCache
  }
  const existing = await loadExtensionServicesState()
  if (existing.services.length > 0) {
    servicesStateCache = existing
    return existing
  }

  const flags = await chrome.storage.local.get([SERVICES_MIGRATION_FLAG_KEY, CONFIG_STORAGE_KEY, RULES_STORAGE_KEY])
  if (flags[SERVICES_MIGRATION_FLAG_KEY]) {
    servicesStateCache = existing
    return existing
  }

  const migrated = await migrateLegacyExtensionConfigIfNeeded()
  servicesStateCache = migrated
  return migrated
}

/**
 * Convert a service row to legacy {@link ExtensionConfig} shape.
 * @param service Service profile
 * @returns Extension config for OTA/API helpers
 */
export function serviceProfileToExtensionConfig(service: ServiceProfile): ExtensionConfig {
  return {
    baseUrl: service.baseUrl,
    scriptKey: service.scriptKey,
    developMode: service.developMode !== false,
  }
}

/**
 * Resolve gmScope for a scriptKey from persisted meta.
 * @param scriptKey Script key
 * @param fallbackLabel Label when meta is missing
 * @returns gmScope string
 */
export async function loadGmScopeForScriptKey(scriptKey: string, fallbackLabel: string): Promise<string> {
  const state = await ensureExtensionServicesState()
  return getGmScopeForScriptKey(scriptKey, state.scriptKeyMeta, fallbackLabel)
}

/**
 * Upsert a service by `(baseUrl, scriptKey)` without global cache wipe.
 * @param input Service fields to create or update
 * @returns Whether the row was created and the resulting service
 */
export async function upsertService(input: UpsertServiceInput): Promise<{ created: boolean; service: ServiceProfile }> {
  const state = await ensureExtensionServicesState()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const scriptKey = normalizeScriptKey(input.scriptKey)
  if (!baseUrl || !scriptKey) {
    throw new Error('Missing Server URL or Script Key.')
  }

  const now = Date.now()
  const existing = findServiceByEndpoint(state.services, baseUrl, scriptKey)
  if (existing) {
    const updated: ServiceProfile = {
      ...existing,
      label: input.label?.trim() || existing.label,
      enabled: input.enabled ?? existing.enabled,
      developMode: input.developMode ?? existing.developMode,
      updatedAt: now,
    }
    state.services = state.services.map((s) => (s.id === existing.id ? updated : s))
    state.activeServiceId = updated.id
    ensureScriptKeyMetaEntry(state, scriptKey, updated.label)
    await saveExtensionServicesState(state)
    return { created: false, service: updated }
  }

  const service: ServiceProfile = {
    id: createServiceId(),
    label: input.label?.trim() || defaultLabelFromBaseUrl(baseUrl),
    baseUrl,
    scriptKey,
    enabled: input.enabled ?? true,
    developMode: input.developMode ?? false,
    createdAt: now,
    updatedAt: now,
  }
  state.services = [...state.services, service]
  state.activeServiceId = service.id
  ensureScriptKeyMetaEntry(state, scriptKey, service.label)
  await saveExtensionServicesState(state)
  return { created: true, service }
}

/**
 * Reset Options to defaults (clears service list until user saves again).
 */
export async function resetOptionsServiceConfig(): Promise<void> {
  const state: ExtensionServicesState = { services: [], scriptKeyMeta: [] }
  servicesStateCache = state
  await chrome.storage.local.set({
    [SERVICES_STORAGE_KEY]: state,
    [CONFIG_STORAGE_KEY]: { ...DEFAULT_CONFIG, scriptKey: '' },
  })
}

/**
 * Save Options form against the active service (update in place or create first row).
 * @param config Form config from Options page
 * @returns Whether the OTA endpoint changed
 */
export async function saveOptionsServiceConfig(config: ExtensionConfig): Promise<{ endpointChanged: boolean }> {
  const state = await ensureExtensionServicesState()
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const scriptKey = normalizeScriptKey(config.scriptKey)
  if (!baseUrl || !scriptKey) {
    throw new Error('Missing Server URL or Script Key.')
  }

  let active = state.services.find((s) => s.id === state.activeServiceId) ?? state.services[0]
  if (!active) {
    await upsertService({
      baseUrl,
      scriptKey,
      developMode: config.developMode,
      enabled: true,
    })
    try {
      await refreshExtensionServiceData({ baseUrl, scriptKey, developMode: config.developMode })
    } catch {
      // Saved; user can sync manually.
    }
    return { endpointChanged: true }
  }

  const duplicate = state.services.find((s) => s.id !== active!.id && serviceEndpointKey(s.baseUrl, s.scriptKey) === serviceEndpointKey(baseUrl, scriptKey))
  if (duplicate) {
    throw new Error('A service with this Server URL and Script Key already exists.')
  }

  const endpointChanged = serviceEndpointKey(active.baseUrl, active.scriptKey) !== serviceEndpointKey(baseUrl, scriptKey)
  if (endpointChanged && active.baseUrl && active.scriptKey) {
    await clearRuntimeModuleCache(serviceProfileToExtensionConfig(active))
  }

  active = {
    ...active,
    baseUrl,
    scriptKey,
    developMode: config.developMode,
    updatedAt: Date.now(),
  }
  state.services = state.services.map((s) => (s.id === active!.id ? active! : s))
  ensureScriptKeyMetaEntry(state, scriptKey, active.label)
  await saveExtensionServicesState(state)

  if (endpointChanged) {
    try {
      await refreshExtensionServiceData(serviceProfileToExtensionConfig(active))
    } catch {
      // Saved; user can sync manually.
    }
  }

  return { endpointChanged }
}

/**
 * Load active service row and scriptKey metadata for Options detail panel.
 * @returns Active service detail or empty defaults
 */
export async function loadActiveServiceDetail(): Promise<{
  state: ExtensionServicesState
  service: ServiceProfile | null
  gmScope: string
  scriptKeyRefCount: number
}> {
  const state = await ensureExtensionServicesState()
  const service = state.services.find((s) => s.id === state.activeServiceId) ?? state.services[0] ?? null
  if (!service) {
    return { state, service: null, gmScope: '', scriptKeyRefCount: 0 }
  }
  const scriptKey = normalizeScriptKey(service.scriptKey)
  return {
    state,
    service,
    gmScope: getGmScopeForScriptKey(scriptKey, state.scriptKeyMeta, service.label),
    scriptKeyRefCount: countServiceRefs(scriptKey, state.services),
  }
}

export interface SaveOptionsServiceInput {
  serviceId: string
  label: string
  baseUrl: string
  scriptKey: string
  enabled: boolean
  developMode: boolean
  gmScope?: string
}

/**
 * Save Options detail form for the active service row.
 * @param input Service fields from Options detail panel
 * @returns Whether the OTA endpoint changed
 */
export async function saveActiveServiceFromOptions(input: SaveOptionsServiceInput): Promise<{ endpointChanged: boolean }> {
  const state = await ensureExtensionServicesState()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const scriptKey = normalizeScriptKey(input.scriptKey)
  if (!baseUrl || !scriptKey) {
    throw new Error('Please enter Server URL and Script Key.')
  }

  const active = state.services.find((s) => s.id === input.serviceId)
  if (!active) {
    throw new Error('Selected service not found.')
  }

  const duplicate = state.services.find((s) => s.id !== active.id && serviceEndpointKey(s.baseUrl, s.scriptKey) === serviceEndpointKey(baseUrl, scriptKey))
  if (duplicate) {
    throw new Error('A service with this Server URL and Script Key already exists.')
  }

  const endpointChanged = serviceEndpointKey(active.baseUrl, active.scriptKey) !== serviceEndpointKey(baseUrl, scriptKey)
  if (endpointChanged && active.baseUrl && active.scriptKey) {
    await clearRuntimeModuleCache(serviceProfileToExtensionConfig(active))
  }

  const updated: ServiceProfile = {
    ...active,
    label: input.label.trim() || defaultLabelFromBaseUrl(baseUrl),
    baseUrl,
    scriptKey,
    enabled: input.enabled,
    developMode: input.developMode,
    updatedAt: Date.now(),
  }
  state.services = state.services.map((s) => (s.id === active.id ? updated : s))
  state.activeServiceId = updated.id
  ensureScriptKeyMetaEntry(state, scriptKey, updated.label)

  if (input.gmScope?.trim()) {
    setGmScopeOnState(state, scriptKey, input.gmScope.trim())
  }

  await saveExtensionServicesState(state)

  if (endpointChanged) {
    try {
      await refreshExtensionServiceData(serviceProfileToExtensionConfig(updated))
    } catch {
      // Saved; user can sync manually.
    }
  }

  return { endpointChanged }
}

/**
 * Create a new service row and select it in Options.
 * @param input Initial service fields
 * @returns Created service profile
 */
export async function createServiceFromOptions(input: Omit<SaveOptionsServiceInput, 'serviceId'>): Promise<ServiceProfile> {
  const state = await ensureExtensionServicesState()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const scriptKey = normalizeScriptKey(input.scriptKey)
  if (!baseUrl || !scriptKey) {
    throw new Error('Please enter Server URL and Script Key.')
  }

  if (findServiceByEndpoint(state.services, baseUrl, scriptKey)) {
    throw new Error('A service with this Server URL and Script Key already exists.')
  }

  const now = Date.now()
  const service: ServiceProfile = {
    id: createServiceId(),
    label: input.label.trim() || defaultLabelFromBaseUrl(baseUrl),
    baseUrl,
    scriptKey,
    enabled: input.enabled,
    developMode: input.developMode,
    createdAt: now,
    updatedAt: now,
  }
  state.services = [...state.services, service]
  state.activeServiceId = service.id
  ensureScriptKeyMetaEntry(state, scriptKey, service.label)
  if (input.gmScope?.trim()) {
    setGmScopeOnState(state, scriptKey, input.gmScope.trim())
  }
  await saveExtensionServicesState(state)
  try {
    await refreshExtensionServiceData(serviceProfileToExtensionConfig(service))
  } catch {
    // Saved; user can sync manually.
  }
  return service
}

/**
 * Select a service row in Options.
 * @param serviceId Service id to activate
 */
export async function setActiveServiceId(serviceId: string): Promise<void> {
  const state = await ensureExtensionServicesState()
  if (!state.services.some((s) => s.id === serviceId)) {
    return
  }
  state.activeServiceId = serviceId
  await saveExtensionServicesState(state)
}

/**
 * Reorder a service row (list order defines OTA priority).
 * @param serviceId Service to move
 * @param direction Move up or down in the list
 */
export async function moveService(serviceId: string, direction: 'up' | 'down'): Promise<void> {
  const state = await ensureExtensionServicesState()
  const index = state.services.findIndex((s) => s.id === serviceId)
  if (index < 0) {
    return
  }
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= state.services.length) {
    return
  }
  const next = [...state.services]
  const [item] = next.splice(index, 1)
  next.splice(targetIndex, 0, item)
  state.services = next
  await saveExtensionServicesState(state)
}

function setGmScopeOnState(state: ExtensionServicesState, scriptKey: string, gmScope: string): void {
  const normalized = normalizeScriptKey(scriptKey)
  const scope = defaultGmScopeFromLabel(gmScope)
  const conflict = state.scriptKeyMeta.find((m) => m.gmScope === scope && normalizeScriptKey(m.scriptKey) !== normalized)
  if (conflict) {
    throw new Error(`GM scope "${scope}" is already used by another script key.`)
  }
  const existing = state.scriptKeyMeta.find((m) => normalizeScriptKey(m.scriptKey) === normalized)
  if (existing) {
    existing.gmScope = scope
    return
  }
  state.scriptKeyMeta.push({ scriptKey: normalized, gmScope: scope })
}

/**
 * Load Options form config from the active service.
 * @returns Config for Options form fields
 */
export async function loadOptionsServiceConfig(): Promise<ExtensionConfig> {
  const state = await ensureExtensionServicesState()
  const active = state.services.find((s) => s.id === state.activeServiceId) ?? state.services[0]
  if (active) {
    return serviceProfileToExtensionConfig(active)
  }
  return { ...DEFAULT_CONFIG }
}

/**
 * Enable or disable a service row.
 * @param serviceId Target service id
 * @param enabled Whether the service is enabled
 */
export async function setServiceEnabled(serviceId: string, enabled: boolean): Promise<void> {
  const state = await ensureExtensionServicesState()
  state.services = state.services.map((s) => (s.id === serviceId ? { ...s, enabled, updatedAt: Date.now() } : s))
  await saveExtensionServicesState(state)
}

/**
 * Remove a service and clear scoped caches when no refs remain.
 * @param serviceId Service id to remove
 */
export async function removeService(serviceId: string): Promise<void> {
  const state = await ensureExtensionServicesState()
  const target = state.services.find((s) => s.id === serviceId)
  if (!target) {
    return
  }

  await clearRuntimeModuleCache(serviceProfileToExtensionConfig(target))

  const scriptKey = normalizeScriptKey(target.scriptKey)
  state.services = state.services.filter((s) => s.id !== serviceId)
  if (state.activeServiceId === serviceId) {
    state.activeServiceId = state.services[0]?.id
  }

  if (scriptKey && countServiceRefs(scriptKey, state.services) === 0) {
    await clearScriptKeyCapabilityLayer(scriptKey, state)
  }

  await saveExtensionServicesState(state)
}

async function clearScriptKeyCapabilityLayer(scriptKey: string, state: ExtensionServicesState): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  state.scriptKeyMeta = state.scriptKeyMeta.filter((m) => normalizeScriptKey(m.scriptKey) !== normalized)

  const all = await chrome.storage.local.get(null)
  const toRemove = [scriptKeyRulesStorageKey(normalized), scriptKeyListCacheStorageKey(normalized)]
  for (const key of Object.keys(all)) {
    if (key.startsWith(`${SCRIPT_ENABLED_PREFIX}${normalized}:`)) {
      toRemove.push(key)
    }
  }
  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove)
  }
}

async function syncLegacyConfigFromServicesState(state: ExtensionServicesState): Promise<void> {
  const firstKey = getEnabledScriptKeys(state.services)[0]
  const ota = firstKey ? resolveOtaEndpoint(firstKey, state.services) : state.services[0]
  const dev = resolveDevelopService(state.services)
  if (ota) {
    await chrome.storage.local.set({
      [CONFIG_STORAGE_KEY]: {
        baseUrl: ota.baseUrl,
        scriptKey: ota.scriptKey,
        developMode: dev !== null,
      },
    })
    return
  }
  await chrome.storage.local.set({
    [CONFIG_STORAGE_KEY]: { ...DEFAULT_CONFIG, scriptKey: '' },
  })
}

async function migrateLegacyExtensionConfigIfNeeded(): Promise<ExtensionServicesState> {
  const result = await chrome.storage.local.get([CONFIG_STORAGE_KEY, RULES_STORAGE_KEY])
  const legacyConfig = result[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined
  const services: ServiceProfile[] = []
  const now = Date.now()

  if (legacyConfig?.baseUrl && legacyConfig?.scriptKey) {
    const baseUrl = normalizeBaseUrl(legacyConfig.baseUrl)
    const scriptKey = normalizeScriptKey(legacyConfig.scriptKey)
    services.push({
      id: createServiceId(),
      label: defaultLabelFromBaseUrl(baseUrl),
      baseUrl,
      scriptKey,
      enabled: true,
      developMode: legacyConfig.developMode !== false,
      createdAt: now,
      updatedAt: now,
    })
  }

  const state: ExtensionServicesState = {
    services,
    scriptKeyMeta: [],
    activeServiceId: services[0]?.id,
  }
  for (const service of services) {
    ensureScriptKeyMetaEntry(state, service.scriptKey, service.label)
  }

  const primaryScriptKey = services[0]?.scriptKey
  const writes: Record<string, unknown> = {
    [SERVICES_STORAGE_KEY]: state,
    [SERVICES_MIGRATION_FLAG_KEY]: 1,
  }

  const legacyRules = result[RULES_STORAGE_KEY]
  if (primaryScriptKey && Array.isArray(legacyRules)) {
    writes[scriptKeyRulesStorageKey(primaryScriptKey)] = legacyRules
  }

  await chrome.storage.local.set(writes)

  if (primaryScriptKey) {
    const all = await chrome.storage.local.get(null)
    const migratedEnabled: Record<string, boolean> = {}
    for (const key of Object.keys(all)) {
      if (!key.startsWith(SCRIPT_ENABLED_PREFIX)) {
        continue
      }
      const rest = key.slice(SCRIPT_ENABLED_PREFIX.length)
      if (rest.includes(':')) {
        continue
      }
      migratedEnabled[scriptEnabledStorageKey(primaryScriptKey, rest)] = all[key] as boolean
    }
    if (Object.keys(migratedEnabled).length) {
      await chrome.storage.local.set(migratedEnabled)
    }
  }

  servicesStateCache = state
  await syncLegacyConfigFromServicesState(state)
  return state
}

async function getPrimaryScriptKeyForLegacyReads(): Promise<string | null> {
  const state = await ensureExtensionServicesState()
  const enabled = getEnabledScriptKeys(state.services)
  if (enabled[0]) {
    return enabled[0]
  }
  const first = state.services[0]?.scriptKey
  return first ? normalizeScriptKey(first) : null
}

function parseExtensionRules(raw: unknown): ExtensionRuleEntry[] {
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

/**
 * @deprecated Returns OTA representative config for the first enabled scriptKey.
 */
export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const state = await ensureExtensionServicesState()
  const firstKey = getEnabledScriptKeys(state.services)[0]
  if (firstKey) {
    const ota = resolveOtaEndpoint(firstKey, state.services)
    if (ota) {
      return {
        baseUrl: ota.baseUrl,
        scriptKey: ota.scriptKey,
        developMode: resolveDevelopService(state.services) !== null,
      }
    }
  }

  const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY)
  const raw = result[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined
  if (raw?.baseUrl && raw?.scriptKey) {
    return { ...DEFAULT_CONFIG, ...raw, baseUrl: normalizeBaseUrl(raw.baseUrl), scriptKey: normalizeScriptKey(raw.scriptKey) }
  }
  return { ...DEFAULT_CONFIG }
}

export async function loadScriptKeyRules(scriptKey: string): Promise<ExtensionRuleEntry[]> {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return []
  }
  const scopedKey = scriptKeyRulesStorageKey(normalized)
  const result = await chrome.storage.local.get(scopedKey)
  const scopedRules = parseExtensionRules(result[scopedKey])
  if (scopedRules.length > 0) {
    return scopedRules
  }

  const legacy = await chrome.storage.local.get(RULES_STORAGE_KEY)
  const legacyRules = parseExtensionRules(legacy[RULES_STORAGE_KEY])
  const state = await ensureExtensionServicesState()
  const primaryKey = getEnabledScriptKeys(state.services)[0] ?? state.services[0]?.scriptKey
  if (legacyRules.length > 0 && primaryKey && normalizeScriptKey(primaryKey) === normalized) {
    return legacyRules
  }
  return []
}

/**
 * Persist RULE entries for a scriptKey capability bucket.
 * @param scriptKey Script key scope
 * @param rules Rule entries to store
 */
export async function saveScriptKeyRules(scriptKey: string, rules: ExtensionRuleEntry[]): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return
  }
  await chrome.storage.local.set({ [scriptKeyRulesStorageKey(normalized)]: rules })
}

/**
 * Merge RULE from all enabled unique scriptKeys (union for tab-match / inject gating).
 * @returns Combined rule list in enabled scriptKey list order
 */
export async function loadMergedRules(): Promise<ExtensionRuleEntry[]> {
  const state = await ensureExtensionServicesState()
  const scriptKeys = getEnabledScriptKeys(state.services)
  const merged: ExtensionRuleEntry[] = []
  for (const scriptKey of scriptKeys) {
    const rules = await loadScriptKeyRules(scriptKey)
    merged.push(...rules)
  }
  return merged
}

/**
 * @deprecated Use {@link loadMergedRules} or {@link loadScriptKeyRules}.
 */
export async function loadExtensionRules(): Promise<ExtensionRuleEntry[]> {
  return loadMergedRules()
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
    const rest = key.slice(SCRIPT_ENABLED_PREFIX.length)
    if (rest.includes(':')) {
      continue
    }
    if (isManagedScriptFilename(rest)) {
      names.add(rest)
    }
  }
  return Array.from(names).sort()
}

function scriptNamesFromEnabledStorageKeysForScriptKey(scriptKey: string, storageKeys: string[]): string[] {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return []
  }
  const scopedPrefix = `${SCRIPT_ENABLED_PREFIX}${normalized}:`
  const names = new Set<string>()
  for (const key of storageKeys) {
    if (!key.startsWith(scopedPrefix)) {
      continue
    }
    const file = key.slice(scopedPrefix.length)
    if (isManagedScriptFilename(file)) {
      names.add(file)
    }
  }
  return Array.from(names).sort()
}

export async function isScriptEnabled(scriptKey: string, scriptName: string): Promise<boolean> {
  const map = await loadScriptEnabledMapForScriptKey(scriptKey, [scriptName])
  return map.get(scriptName) !== false
}

/** Batch-read per-script enabled flags for a scriptKey (default enabled when unset). */
export async function loadScriptEnabledMapForScriptKey(scriptKey: string, scriptNames: string[]): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }

  const normalized = normalizeScriptKey(scriptKey)
  const scopedKeys = scriptNames.map((name) => scriptEnabledStorageKey(normalized, name))
  const legacyKeys = scriptNames.map((name) => `${SCRIPT_ENABLED_PREFIX}${name}`)
  const result = await chrome.storage.local.get([...scopedKeys, ...legacyKeys])

  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const scopedKey = scriptEnabledStorageKey(normalized, name)
    const legacyKey = `${SCRIPT_ENABLED_PREFIX}${name}`
    if (scopedKey in result) {
      map.set(name, result[scopedKey] !== false)
      continue
    }
    map.set(name, result[legacyKey] !== false)
  }
  return map
}

/** @deprecated Use {@link loadScriptEnabledMapForScriptKey} */
export async function loadScriptEnabledMap(scriptNames: string[]): Promise<Map<string, boolean>> {
  const scriptKey = await getPrimaryScriptKeyForLegacyReads()
  if (!scriptKey) {
    return new Map(scriptNames.map((name) => [name, true]))
  }
  return loadScriptEnabledMapForScriptKey(scriptKey, scriptNames)
}

export async function setScriptEnabled(scriptKey: string, scriptName: string, enabled: boolean): Promise<void> {
  const key = scriptEnabledStorageKey(scriptKey, scriptName)
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

/**
 * Clear OTA module caches for each enabled unique scriptKey (OTA representative endpoint).
 * @returns Number of distinct endpoint scopes cleared
 */
export async function clearRuntimeModuleCachesForEnabledScriptKeys(): Promise<number> {
  const state = await ensureExtensionServicesState()
  const clearedScopes = new Set<string>()
  let count = 0

  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const endpoint = resolveOtaEndpoint(scriptKey, state.services)
    if (!endpoint) {
      continue
    }
    const scope = serviceEndpointKey(endpoint.baseUrl, endpoint.scriptKey)
    if (clearedScopes.has(scope)) {
      continue
    }
    clearedScopes.add(scope)
    await clearRuntimeModuleCache(serviceProfileToExtensionConfig(endpoint))
    count += 1
  }

  return count
}

async function wipeGlobalRuntimeStorage(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const network = all[gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]
  const legacy = all[gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]
  const toRemove: string[] = []
  for (const key of Object.keys(all)) {
    if (key === CONFIG_STORAGE_KEY || key === SERVICES_STORAGE_KEY) {
      continue
    }
    if (key.startsWith(SCRIPTKEY_RULES_PREFIX) || key.startsWith(SCRIPT_ENABLED_PREFIX)) {
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
}

/** Reset runtime state keys while keeping extension config and rules. */
export async function resetRuntimeState(config: ExtensionConfig): Promise<void> {
  await wipeGlobalRuntimeStorage()
  await clearRuntimeModuleCache(config)
}

/** Reset runtime state and clear module caches for all enabled scriptKeys. */
export async function resetRuntimeStateForEnabledScriptKeys(): Promise<void> {
  await wipeGlobalRuntimeStorage()
  await clearRuntimeModuleCachesForEnabledScriptKeys()
}

/**
 * Resolve editor target: active Service row, else first enabled Service.
 * @returns Config for editor URL or null when no service configured
 */
export async function resolveEditorServiceConfig(): Promise<ExtensionConfig | null> {
  const { service } = await loadActiveServiceDetail()
  if (service?.baseUrl && service.scriptKey) {
    return serviceProfileToExtensionConfig(service)
  }
  const state = await ensureExtensionServicesState()
  const firstEnabled = state.services.find((row) => row.enabled !== false)
  if (firstEnabled?.baseUrl && firstEnabled.scriptKey) {
    return serviceProfileToExtensionConfig(firstEnabled)
  }
  return null
}

function normalizeExtensionServiceScope(config: ExtensionConfig): string {
  return `${config.baseUrl.trim().replace(/\/+$/, '')}|${config.scriptKey.trim()}`
}

/**
 * Whether two configs point at the same MagickMonkey service (baseUrl + scriptKey).
 * @param a First config
 * @param b Second config
 * @returns True when the service scope matches
 */
export function isSameExtensionService(a: ExtensionConfig, b: ExtensionConfig): boolean {
  return normalizeExtensionServiceScope(a) === normalizeExtensionServiceScope(b)
}

/**
 * Clear rules, script list, runtime/module caches, and per-script toggles when switching service.
 * Preserves shell network toggle preferences.
 * @param previousConfig Prior service config used to drop scoped module cache keys
 */
export async function clearExtensionCachesForServiceSwitch(previousConfig?: ExtensionConfig): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const network = all[gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]
  const legacy = all[gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]

  if (previousConfig?.baseUrl.trim() && previousConfig.scriptKey.trim()) {
    await clearRuntimeModuleCache(previousConfig)
  }
  await clearRuntimeModuleCache({ baseUrl: '', scriptKey: '', developMode: true })

  const toRemove: string[] = [SCRIPT_LIST_CACHE_KEY, SCRIPT_LIST_STORAGE_KEY]
  for (const key of Object.keys(all)) {
    if (key === CONFIG_STORAGE_KEY || key === SERVICES_STORAGE_KEY) {
      continue
    }
    if (key.startsWith(SCRIPTKEY_RULES_PREFIX) || key.startsWith(SCRIPT_ENABLED_PREFIX) || key.startsWith(GM_STORAGE_PREFIX)) {
      continue
    }
    if (key.startsWith(RUNTIME_STATE_KEY_PREFIX)) {
      toRemove.push(key)
    }
  }

  if (toRemove.length > 0) {
    await chrome.storage.local.remove(toRemove)
  }

  await chrome.storage.local.set({
    [gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]: network === true || network === false ? network : true,
  })
  if (legacy === true || legacy === false) {
    await chrome.storage.local.set({ [gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]: legacy })
  }

  const { invalidateTabMatchCache } = await import('./tab-match-cache')
  await invalidateTabMatchCache()
}

/**
 * Pull fresh RULE and managed script list for the active service.
 * @param config Extension connection config
 */
export async function refreshExtensionServiceData(config: ExtensionConfig): Promise<void> {
  await syncRulesFromServer(config)
  await fetchManagedScriptList(config)
}

/**
 * @deprecated Prefer {@link upsertService} or {@link saveOptionsServiceConfig}. No global cache wipe.
 * @param nextConfig Config to save
 * @returns Whether the active OTA endpoint changed
 */
export async function applyExtensionServiceConfig(nextConfig: ExtensionConfig): Promise<{ serviceChanged: boolean }> {
  const previous = await loadExtensionConfig()
  const { created, service } = await upsertService({
    baseUrl: nextConfig.baseUrl,
    scriptKey: nextConfig.scriptKey,
    developMode: nextConfig.developMode,
    enabled: true,
  })

  const serviceChanged = created || previous.baseUrl !== service.baseUrl || previous.scriptKey !== service.scriptKey || previous.developMode !== (nextConfig.developMode !== false)

  if (created) {
    try {
      await refreshExtensionServiceData(serviceProfileToExtensionConfig(service))
    } catch {
      // Config is saved; user can sync manually if the network request fails.
    }
  }

  return { serviceChanged }
}

export async function syncRulesFromServer(config: ExtensionConfig): Promise<ExtensionRuleEntry[]> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const scriptKey = normalizeScriptKey(config.scriptKey)
  if (!baseUrl || !scriptKey) {
    throw new Error('Missing Server URL or Script Key.')
  }

  const url = `${baseUrl}/api/tampermonkey/${encodeURIComponent(scriptKey)}/rule`
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
  await saveScriptKeyRules(scriptKey, rules)
  const { invalidateTabMatchCache } = await import('./tab-match-cache')
  await invalidateTabMatchCache()
  return rules
}

/**
 * Sync RULE for each enabled unique scriptKey using its OTA representative endpoint.
 * @returns Per scriptKey sync results
 */
export async function syncRulesForEnabledScriptKeys(): Promise<Array<{ scriptKey: string; count: number }>> {
  const state = await ensureExtensionServicesState()
  const results: Array<{ scriptKey: string; count: number }> = []
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const endpoint = resolveOtaEndpoint(scriptKey, state.services)
    if (!endpoint) {
      continue
    }
    const rules = await syncRulesFromServer(serviceProfileToExtensionConfig(endpoint))
    results.push({ scriptKey, count: rules.length })
  }
  return results
}
