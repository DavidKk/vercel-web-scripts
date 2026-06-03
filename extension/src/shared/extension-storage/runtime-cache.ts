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
import { normalizeShellLogOutputMode, SHELL_LOG_OUTPUT_MODE_KEY, type ShellLogOutputMode } from '@shared/shell-log-output'

import type { ExtensionConfig } from '../../types'
import { CONFIG_STORAGE_KEY, SERVICES_STORAGE_KEY } from '../../types'
import { SCRIPT_ENABLED_PREFIX, SCRIPTKEY_RULES_PREFIX } from '../extension-multi-service-pure'
import { getEnabledScriptKeys, resolveOtaEndpoint, serviceEndpointKey } from '../extension-services'
import { GM_STORAGE_PREFIX, SCRIPT_LIST_CACHE_KEY, SCRIPT_LIST_STORAGE_KEY } from './constants'
import { ensureExtensionServicesState, serviceProfileToExtensionConfig } from './services-state'

export function gmStorageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
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

export async function getShellLogOutputMode(): Promise<ShellLogOutputMode> {
  const result = await chrome.storage.local.get(gmStorageKey(SHELL_LOG_OUTPUT_MODE_KEY))
  return normalizeShellLogOutputMode(result[gmStorageKey(SHELL_LOG_OUTPUT_MODE_KEY)])
}

export async function setShellLogOutputMode(mode: ShellLogOutputMode): Promise<void> {
  await chrome.storage.local.set({ [gmStorageKey(SHELL_LOG_OUTPUT_MODE_KEY)]: mode })
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

  const { invalidateTabMatchCache } = await import('../tab-match-cache')
  await invalidateTabMatchCache()
}
