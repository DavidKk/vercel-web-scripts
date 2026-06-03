import type { ExtensionConfig, ExtensionServicesState, ServiceProfile } from '../../types'
import { UNCONFIGURED_CONFIG } from '../../types'
import {
  countServiceRefs,
  createServiceId,
  defaultDevelopModeForBaseUrl,
  defaultLabelFromBaseUrl,
  ensureScriptKeyMetaEntry,
  findServiceByEndpoint,
  getGmScopeForScriptKey,
  normalizeBaseUrl,
  normalizeScriptKey,
  resolveActiveServiceForUi,
  serviceEndpointKey,
} from '../extension-services'
import { clearRuntimeModuleCache } from './runtime-cache'
import { refreshExtensionServiceData } from './service-data-sync'
import { clearScriptKeyCapabilityLayer, ensureExtensionServicesState, saveExtensionServicesState, serviceProfileToExtensionConfig, setGmScopeOnState } from './services-state'
import type { SaveOptionsServiceInput, UpsertServiceInput } from './types'

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
      developMode: input.developMode ?? defaultDevelopModeForBaseUrl(baseUrl),
      updatedAt: now,
    }
    state.services = state.services.map((s) => (s.id === existing.id ? updated : s))
    state.activeServiceId = updated.id
    ensureScriptKeyMetaEntry(state, scriptKey, updated.label, updated.baseUrl)
    await saveExtensionServicesState(state)
    return { created: false, service: updated }
  }

  const service: ServiceProfile = {
    id: createServiceId(),
    label: input.label?.trim() || defaultLabelFromBaseUrl(baseUrl),
    baseUrl,
    scriptKey,
    enabled: input.enabled ?? true,
    developMode: input.developMode ?? defaultDevelopModeForBaseUrl(baseUrl),
    createdAt: now,
    updatedAt: now,
  }
  state.services = [...state.services, service]
  state.activeServiceId = service.id
  ensureScriptKeyMetaEntry(state, scriptKey, service.label, service.baseUrl)
  await saveExtensionServicesState(state)
  return { created: true, service }
}

/**
 * Reset Options to defaults (clears service list until user saves again).
 */
export async function resetOptionsServiceConfig(): Promise<void> {
  await saveExtensionServicesState({ services: [], scriptKeyMeta: [] })
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

  let active = resolveActiveServiceForUi(state) ?? state.services[0]
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
  ensureScriptKeyMetaEntry(state, scriptKey, active.label, active.baseUrl)
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
  const service = resolveActiveServiceForUi(state) ?? state.services[0] ?? null
  if (!service) {
    return { state, service: null, gmScope: '', scriptKeyRefCount: 0 }
  }
  const scriptKey = normalizeScriptKey(service.scriptKey)
  return {
    state,
    service,
    gmScope: getGmScopeForScriptKey(scriptKey, state.scriptKeyMeta, service.label, service.baseUrl),
    scriptKeyRefCount: countServiceRefs(scriptKey, state.services),
  }
}

/**
 * Load Servers detail panel state (no fallback when nothing is selected).
 */
export async function loadOptionsPanelDetail(): Promise<{
  state: ExtensionServicesState
  service: ServiceProfile | null
  gmScope: string
  scriptKeyRefCount: number
}> {
  const state = await ensureExtensionServicesState()
  const activeId = state.activeServiceId
  const service = activeId ? (state.services.find((s) => s.id === activeId) ?? null) : null
  if (!service) {
    return { state, service: null, gmScope: '', scriptKeyRefCount: 0 }
  }
  const scriptKey = normalizeScriptKey(service.scriptKey)
  return {
    state,
    service,
    gmScope: getGmScopeForScriptKey(scriptKey, state.scriptKeyMeta, service.label, service.baseUrl),
    scriptKeyRefCount: countServiceRefs(scriptKey, state.services),
  }
}

/**
 * Clear the active service selection (Servers list).
 */
export async function clearActiveServiceId(): Promise<void> {
  const state = await ensureExtensionServicesState()
  if (!state.activeServiceId) {
    return
  }
  delete state.activeServiceId
  await saveExtensionServicesState(state)
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
  ensureScriptKeyMetaEntry(state, scriptKey, updated.label, updated.baseUrl)

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
    developMode: input.developMode ?? defaultDevelopModeForBaseUrl(baseUrl),
    createdAt: now,
    updatedAt: now,
  }
  state.services = [...state.services, service]
  state.activeServiceId = service.id
  ensureScriptKeyMetaEntry(state, scriptKey, service.label, service.baseUrl)
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

/**
 * Move a service to a new index in the list (list order defines OTA priority).
 * @param serviceId Service to move
 * @param toIndex Insert index in the array **after** removing the service
 */
export async function reorderService(serviceId: string, toIndex: number): Promise<void> {
  const state = await ensureExtensionServicesState()
  const fromIndex = state.services.findIndex((s) => s.id === serviceId)
  if (fromIndex < 0) {
    return
  }
  const next = [...state.services]
  const [item] = next.splice(fromIndex, 1)
  const insertAt = Math.max(0, Math.min(toIndex, next.length))
  next.splice(insertAt, 0, item)
  state.services = next
  await saveExtensionServicesState(state)
}

/**
 * Load Options form config from the active service.
 * @returns Config for Options form fields
 */
export async function loadOptionsServiceConfig(): Promise<ExtensionConfig> {
  const state = await ensureExtensionServicesState()
  const active = resolveActiveServiceForUi(state) ?? state.services[0]
  if (active?.enabled) {
    return serviceProfileToExtensionConfig(active)
  }
  return { ...UNCONFIGURED_CONFIG }
}

/**
 * Enable or disable a service row.
 * @param serviceId Target service id
 * @param enabled Whether the service is enabled
 */
export async function setServiceEnabled(serviceId: string, enabled: boolean): Promise<void> {
  const state = await ensureExtensionServicesState()
  state.services = state.services.map((s) => (s.id === serviceId ? { ...s, enabled, updatedAt: Date.now() } : s))
  if (!enabled && state.activeServiceId === serviceId) {
    const replacement = state.services.find((s) => s.enabled && s.id !== serviceId)
    if (replacement) {
      state.activeServiceId = replacement.id
    } else {
      delete state.activeServiceId
    }
  }
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
    const replacement = state.services.find((s) => s.enabled)
    if (replacement) {
      state.activeServiceId = replacement.id
    } else {
      delete state.activeServiceId
    }
  }

  if (scriptKey && countServiceRefs(scriptKey, state.services) === 0) {
    await clearScriptKeyCapabilityLayer(scriptKey, state)
  }

  await saveExtensionServicesState(state)
}
