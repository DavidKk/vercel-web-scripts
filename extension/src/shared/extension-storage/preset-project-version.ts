import { PRESET_PROJECT_VERSION_KEY, RUNTIME_OTA_STAGE_KEY } from '@shared/launcher-constants'
import type { OtaReleaseStage } from '@shared/script-ota-policy'

import type { ExtensionConfig } from '../../types'
import { serviceEndpointKey } from '../extension-services'
import { gmStorageKey } from './runtime-cache'

/** Minimal module-manifest shape for project version lookup */
export interface ModuleManifestProjectVersion {
  projectVersion?: string
  runtime?: { stage?: string }
}

/**
 * Chrome storage keys that may hold the last executed preset project version.
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @returns Keys in lookup priority order
 */
export function buildPresetProjectVersionStorageKeys(config: ExtensionConfig, gmScope?: string): string[] {
  if (!config.baseUrl.trim() || !config.scriptKey.trim()) {
    return [gmStorageKey(PRESET_PROJECT_VERSION_KEY)]
  }
  const scope = encodeURIComponent(serviceEndpointKey(config.baseUrl, config.scriptKey))
  const logicalScoped = `${PRESET_PROJECT_VERSION_KEY}:${scope}`
  const keys: string[] = []
  if (gmScope?.trim()) {
    keys.push(gmStorageKey(`${gmScope.trim()}_${logicalScoped}`))
  }
  keys.push(gmStorageKey(logicalScoped))
  keys.push(gmStorageKey(PRESET_PROJECT_VERSION_KEY))
  return keys
}

/**
 * Read project version last reported by preset main on an http(s) tab.
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @returns Version string or null when preset has not run yet
 */
export async function readPresetProjectVersion(config: ExtensionConfig, gmScope?: string): Promise<string | null> {
  const keys = buildPresetProjectVersionStorageKeys(config, gmScope)
  const result = await chrome.storage.local.get(keys)
  for (const key of keys) {
    const value = result[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

/**
 * Persist preset project version in extension storage (same keys as GM bridge).
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @param version Semver from manifest or preset runtime
 */
export async function writePresetProjectVersionToStorage(config: ExtensionConfig, gmScope: string | undefined, version: string): Promise<void> {
  const trimmed = version.trim()
  if (!trimmed) {
    return
  }
  const keys = buildPresetProjectVersionStorageKeys(config, gmScope)
  const primaryKey = keys[0]
  if (!primaryKey) {
    return
  }
  await chrome.storage.local.set({ [primaryKey]: trimmed })
}

/**
 * Fetch projectVersion from OTA module-manifest.json (server semver, not content hash).
 * @param config Primary OTA representative config
 * @returns Version string or null when unavailable
 */
export async function fetchPresetProjectVersionFromManifest(config: ExtensionConfig): Promise<string | null> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '')
  const scriptKey = config.scriptKey.trim()
  if (!baseUrl || !scriptKey) {
    return null
  }
  const url = `${baseUrl}/static/${encodeURIComponent(scriptKey)}/module-manifest.json`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return null
    }
    const data = (await res.json()) as ModuleManifestProjectVersion
    const version = data.projectVersion
    if (typeof version === 'string' && version.trim()) {
      return version.trim()
    }
  } catch {
    return null
  }
  return null
}

/**
 * Resolve preset semver: GM storage first, then module-manifest when allowed.
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @param options allowManifestFetch when shell network is enabled
 * @returns Version string or null
 */
export async function resolvePresetProjectVersion(config: ExtensionConfig, gmScope?: string, options?: { allowManifestFetch?: boolean }): Promise<string | null> {
  const fromStorage = await readPresetProjectVersion(config, gmScope)
  if (fromStorage) {
    return fromStorage
  }
  if (options?.allowManifestFetch === false) {
    return null
  }
  const fromManifest = await fetchPresetProjectVersionFromManifest(config)
  if (fromManifest) {
    await writePresetProjectVersionToStorage(config, gmScope, fromManifest)
    return fromManifest
  }
  return null
}

/**
 * Chrome storage keys that may hold the last applied runtime OTA stage.
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @returns Keys in lookup priority order
 */
export function buildRuntimeOtaStageStorageKeys(config: ExtensionConfig, gmScope?: string): string[] {
  if (!config.baseUrl.trim() || !config.scriptKey.trim()) {
    return [gmStorageKey(RUNTIME_OTA_STAGE_KEY)]
  }
  const scope = encodeURIComponent(serviceEndpointKey(config.baseUrl, config.scriptKey))
  const logicalScoped = `${RUNTIME_OTA_STAGE_KEY}:${scope}`
  const keys: string[] = []
  if (gmScope?.trim()) {
    keys.push(gmStorageKey(`${gmScope.trim()}_${logicalScoped}`))
  }
  keys.push(gmStorageKey(logicalScoped))
  keys.push(gmStorageKey(RUNTIME_OTA_STAGE_KEY))
  return keys
}

/**
 * Read runtime OTA stage last reported by launcher on an http(s) tab.
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @returns stable | alpha or null when unknown
 */
export async function readRuntimeOtaStage(config: ExtensionConfig, gmScope?: string): Promise<OtaReleaseStage | null> {
  const keys = buildRuntimeOtaStageStorageKeys(config, gmScope)
  const result = await chrome.storage.local.get(keys)
  for (const key of keys) {
    const value = result[key]
    if (value === 'alpha' || value === 'stable') {
      return value
    }
  }
  return null
}

/**
 * Fetch runtime OTA stage from module-manifest.json.
 * @param config Primary OTA representative config
 * @returns stable | alpha or null when unavailable
 */
export async function fetchRuntimeOtaStageFromManifest(config: ExtensionConfig): Promise<OtaReleaseStage | null> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '')
  const scriptKey = config.scriptKey.trim()
  if (!baseUrl || !scriptKey) {
    return null
  }
  const url = `${baseUrl}/static/${encodeURIComponent(scriptKey)}/module-manifest.json`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return null
    }
    const data = (await res.json()) as ModuleManifestProjectVersion
    return data.runtime?.stage === 'alpha' ? 'alpha' : data.runtime?.stage === 'stable' ? 'stable' : null
  } catch {
    return null
  }
}

/**
 * Resolve runtime OTA stage: GM storage first, then module-manifest when allowed.
 * @param config Primary OTA representative config
 * @param gmScope GM namespace prefix for scoped GM keys
 * @param options allowManifestFetch when shell network is enabled
 * @returns stable | alpha or null
 */
export async function resolveRuntimeOtaStage(config: ExtensionConfig, gmScope?: string, options?: { allowManifestFetch?: boolean }): Promise<OtaReleaseStage | null> {
  const fromStorage = await readRuntimeOtaStage(config, gmScope)
  if (fromStorage) {
    return fromStorage
  }
  if (options?.allowManifestFetch === false) {
    return null
  }
  return fetchRuntimeOtaStageFromManifest(config)
}
