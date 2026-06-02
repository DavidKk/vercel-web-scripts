import type { ExtensionConfig, ExtensionServicesState, ServiceProfile } from '../../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, SERVICES_MIGRATION_FLAG_KEY, SERVICES_STORAGE_KEY } from '../../types'
import {
  buildScriptKeyGroupMetaFromState,
  SCRIPT_ENABLED_PREFIX,
  scriptEnabledStorageKey,
  scriptKeyListCacheStorageKey,
  scriptKeyRulesStorageKey,
} from '../extension-multi-service-pure'
import {
  createServiceId,
  defaultGmScopeFromLabel,
  defaultLabelFromBaseUrl,
  ensureScriptKeyMetaEntry,
  getEnabledScriptKeys,
  getGmScopeForScriptKey,
  normalizeBaseUrl,
  normalizeExtensionServicesState,
  normalizeScriptKey,
  resolveDevelopService,
  resolveOtaEndpoint,
} from '../extension-services'
import { RULES_STORAGE_KEY } from './constants'

let servicesStateCache: ExtensionServicesState | null = null

/**
 * Read multi-service state from chrome.storage.local (no migration).
 * @returns Normalized services state
 */
export async function loadExtensionServicesState(): Promise<ExtensionServicesState> {
  const result = await chrome.storage.local.get(SERVICES_STORAGE_KEY)
  return normalizeExtensionServicesState(result[SERVICES_STORAGE_KEY])
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
    ensureScriptKeyMetaEntry(state, service.scriptKey, service.label, service.baseUrl)
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

export async function loadScriptKeyGroupMeta() {
  const state = await ensureExtensionServicesState()
  return buildScriptKeyGroupMetaFromState(state)
}

export async function getPrimaryScriptKeyForLegacyReads(): Promise<string | null> {
  const state = await ensureExtensionServicesState()
  const enabled = getEnabledScriptKeys(state.services)
  if (enabled[0]) {
    return enabled[0]
  }
  const first = state.services[0]?.scriptKey
  return first ? normalizeScriptKey(first) : null
}

export function setGmScopeOnState(state: ExtensionServicesState, scriptKey: string, gmScope: string): void {
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

export async function clearScriptKeyCapabilityLayer(scriptKey: string, state: ExtensionServicesState): Promise<void> {
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
