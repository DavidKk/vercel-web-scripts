import type { ExtensionConfig } from '../../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, UNCONFIGURED_CONFIG } from '../../types'
import { getEnabledScriptKeys, normalizeBaseUrl, normalizeScriptKey, resolveActiveServiceForUi, resolveDevelopService, resolveOtaEndpoint } from '../extension-services'
import { refreshExtensionServiceData } from './service-data-sync'
import { upsertService } from './services-crud'
import { ensureExtensionServicesState, serviceProfileToExtensionConfig } from './services-state'

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
  return { ...UNCONFIGURED_CONFIG }
}

/**
 * Resolve editor target: active Service row, else first enabled Service.
 * @returns Config for editor URL or null when no service configured
 */
export async function resolveEditorServiceConfig(): Promise<ExtensionConfig | null> {
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
  const ui = resolveActiveServiceForUi(state)
  if (ui?.baseUrl && ui.scriptKey) {
    return serviceProfileToExtensionConfig(ui)
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
