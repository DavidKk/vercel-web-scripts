import { PENDING_SEGMENT } from '@shared/pending-segment'

import type { ExtensionConfig } from '../types'

export const PRESET_VAR_NAMES = [
  '__BASE_URL__',
  '__RULE_API_URL__',
  '__EDITOR_URL__',
  '__HMK_URL__',
  '__SCRIPT_URL__',
  '__IS_DEVELOP_MODE__',
  '__HOSTNAME_PORT__',
  '__GRANTS_STRING__',
] as const

export interface LauncherUrls {
  presetUrl: string
  moduleManifestUrl: string
  remoteScriptUrl: string
  cacheScope: string
  scopedPresetCacheKey: string
  scopedPresetEtagKey: string
  scopedPresetUpdatedNotifyKey: string
  scopedPresetActivatedHashKey: string
  scopedPresetPreviousHashKey: string
  scopedModuleManifestEtagKey: string
  scopedScriptBundleUrlKey: string
  globals: Record<string, string | boolean>
}

const EXTENSION_GRANTS = [
  'GM_addElement',
  'GM_addStyle',
  'GM_log',
  'GM_notification',
  'GM_openInTab',
  'GM_setClipboard',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_setValues',
  'GM_getValues',
  'GM_deleteValues',
  'GM_addValueChangeListener',
  'GM_removeValueChangeListener',
  'GM_xmlhttpRequest',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM_info',
  'unsafeWindow',
] as const

const EXTENSION_GRANTS_STRING = EXTENSION_GRANTS.map((grant) => `...(typeof ${grant} !== 'undefined' ? { ${grant} } : {})`).join(', ')

/**
 * Build preset / manifest / remote URLs and scoped storage keys from extension config.
 * @param config Extension options (baseUrl, scriptKey, developMode)
 * @returns URLs, scoped keys, and preset global assignments
 */
export function buildLauncherUrls(config: ExtensionConfig): LauncherUrls {
  const baseUrl = config.baseUrl.replace(/\/$/, '')
  const key = config.scriptKey.trim()
  const presetUrl = `${baseUrl}/static/${encodeURIComponent(key)}/${PENDING_SEGMENT}/preset.js`
  const moduleManifestUrl = `${baseUrl}/static/${key}/module-manifest.json`
  const remoteScriptUrl = `${baseUrl}/static/${key}/tampermonkey-remote.js`
  const cacheScope = encodeURIComponent(`${baseUrl}|${key}`)

  const pageHost = typeof window !== 'undefined' ? window.location.host : ''

  let wsProtocol = 'ws:'
  try {
    wsProtocol = new URL(baseUrl).protocol === 'https:' ? 'wss:' : 'ws:'
  } catch {
    // keep ws:
  }
  const hostFromBase = (() => {
    try {
      return new URL(baseUrl).host
    } catch {
      return pageHost
    }
  })()

  const globals: Record<string, string | boolean> = {
    __BASE_URL__: baseUrl,
    __RULE_API_URL__: `${baseUrl}/api/tampermonkey/${key}/rule`,
    __EDITOR_URL__: `${baseUrl}/editor`,
    __HMK_URL__: `${wsProtocol}//${hostFromBase}/_next/webpack-hmr`,
    __SCRIPT_URL__: remoteScriptUrl,
    __IS_DEVELOP_MODE__: config.developMode,
    __HOSTNAME_PORT__: pageHost,
    __GRANTS_STRING__: EXTENSION_GRANTS_STRING,
  }

  return {
    presetUrl,
    moduleManifestUrl,
    remoteScriptUrl,
    cacheScope,
    scopedPresetCacheKey: `vws_preset_cache:${cacheScope}`,
    scopedPresetEtagKey: `vws_preset_etag:${cacheScope}`,
    scopedPresetUpdatedNotifyKey: `vws_preset_updated_notify:${cacheScope}`,
    scopedPresetActivatedHashKey: `vws_preset_activated_hash:${cacheScope}`,
    scopedPresetPreviousHashKey: `vws_preset_previous_hash:${cacheScope}`,
    scopedModuleManifestEtagKey: `vws_module_manifest_etag:${cacheScope}`,
    scopedScriptBundleUrlKey: `vws_script_bundle_url:${cacheScope}`,
    globals,
  }
}
