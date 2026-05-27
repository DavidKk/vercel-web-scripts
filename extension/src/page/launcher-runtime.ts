/**
 * Chrome extension launcher: loads preset-core and remote script (same flow as Tampermonkey launcher).
 */

import { launcherLogger } from '@ext/shared/logger'
import {
  BOOT_LOG_KEY,
  BOOT_LOG_MAX,
  LEGACY_AUTO_UPDATE_SCRIPT_KEY,
  MODULE_LOG_PREFIX,
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

import type { LauncherUrls } from './config'
import { PRESET_VAR_NAMES } from './config'
import type { GMApi, GMRequestDetails } from './gm-types'

interface ManifestModule {
  id?: string
  url?: string
  hash?: { algorithm?: string; value?: string }
}

interface ModuleManifest {
  modules?: ManifestModule[]
}

/**
 * Start preset load pipeline (manifest → preset → execute).
 * @param urls Resolved launcher URLs and globals
 * @param gm GM API on globalThis
 */
export function startLauncher(urls: LauncherUrls, gm: GMApi): void {
  const {
    presetUrl,
    moduleManifestUrl,
    scopedPresetCacheKey,
    scopedPresetEtagKey,
    scopedPresetUpdatedNotifyKey,
    scopedPresetActivatedHashKey,
    scopedPresetPreviousHashKey,
    scopedModuleManifestEtagKey,
    scopedScriptBundleUrlKey,
    globals,
  } = urls

  let runtimeScriptUrl = globals.__SCRIPT_URL__ as string
  let pendingManifestEtag = ''

  function shortHash(h: string): string {
    if (!h || typeof h !== 'string' || h.length === 0) return '(none)'
    return h.length > 16 ? `${h.slice(0, 16)}...` : h
  }

  function bootLog(level: 'info' | 'warn' | 'fail' | 'ok', ...parts: unknown[]): void {
    const msg = parts
      .map((x) => (x === undefined || x === null ? '' : String(x)))
      .join(' ')
      .trim()
    if (level === 'fail') {
      launcherLogger.error(msg)
    } else if (level === 'warn') {
      launcherLogger.warn(msg)
    } else if (level === 'ok') {
      launcherLogger.ok(msg)
    } else {
      launcherLogger.info(msg)
    }
    try {
      const root = globalThis as Record<string, unknown>
      if (!Array.isArray(root[BOOT_LOG_KEY])) {
        root[BOOT_LOG_KEY] = []
      }
      const arr = root[BOOT_LOG_KEY] as { t: number; level: string; message: string }[]
      if (arr.length >= BOOT_LOG_MAX) arr.shift()
      arr.push({ t: Date.now(), level, message: msg })
    } catch {
      // ignore
    }
  }

  function isTabActive(): boolean {
    if (typeof document === 'undefined') return false
    if (document.hidden !== false) return false
    if (typeof document.visibilityState !== 'undefined' && document.visibilityState !== 'visible') return false
    return true
  }

  function assignGlobals(g: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(globals)) {
      g[k] = v
    }
    g.__SCRIPT_URL__ = runtimeScriptUrl
  }

  function runPreset(presetCode: string): void {
    const bytes = presetCode?.length ?? 0
    bootLog('info', MODULE_LOG_PREFIX, `execute:start bytes=${bytes}`)
    const g = globalThis as Record<string, unknown>
    assignGlobals(g)
    g.__GLOBAL__ = g
    try {
      const decls = PRESET_VAR_NAMES.map((n) => `var ${n} = g.${n};`).join('\n')
      const body = `with(g) {\n${decls}\n${presetCode}\n}`

      new Function('g', body)(g)
      bootLog('ok', MODULE_LOG_PREFIX, `execute:success bytes=${bytes}`)
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      bootLog('fail', MODULE_LOG_PREFIX, 'execute:failed', em)
      launcherLogger.error('preset run failed:', em, e)
    }
  }

  function getResponseHeader(res: { responseHeaders?: string }, name: string): string | null {
    const h = res.responseHeaders ?? ''
    const lines = h.split(/\r?\n/)
    const n = name.toLowerCase()
    for (const line of lines) {
      if (line.toLowerCase().startsWith(`${n}:`)) {
        return line.slice(line.indexOf(':') + 1).trim()
      }
    }
    return null
  }

  function normalizeEtag(etag: string): string {
    if (!etag || typeof etag !== 'string') return ''
    return etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  }

  function readScopedValue(scopedKey: string, legacyKey: string, defaultValue: unknown): unknown {
    const scoped = gm.GM_getValue(scopedKey, null)
    if (scoped !== null && scoped !== undefined && scoped !== '') {
      return scoped
    }
    return gm.GM_getValue(legacyKey, defaultValue)
  }

  function writeScopedAndLegacy(scopedKey: string, legacyKey: string, value: unknown): void {
    gm.GM_setValue(scopedKey, value)
    gm.GM_setValue(legacyKey, value)
  }

  function extractPresetCoreModule(data: ModuleManifest | null): ManifestModule | null {
    if (!data?.modules) return null
    return data.modules.find((m) => m?.id === 'preset-core') ?? null
  }

  function hashFromPresetCoreModule(mod: ManifestModule | null): string {
    if (!mod?.hash || mod.hash.algorithm !== 'sha1' || typeof mod.hash.value !== 'string') {
      return ''
    }
    return normalizeEtag(mod.hash.value)
  }

  function extractScriptBundleModule(data: ModuleManifest | null): ManifestModule | null {
    if (!data?.modules) return null
    return data.modules.find((m) => m?.id === 'script-bundle') ?? null
  }

  function gmXhr(details: GMRequestDetails): Promise<{ status: number; responseText: string; responseHeaders?: string }> {
    return new Promise((resolve, reject) => {
      gm.GM_xmlhttpRequest({
        ...details,
        onload: (res) => resolve(res),
        onerror: (err) => reject(err),
      })
    })
  }

  function fetchModuleManifestWithConditional(
    ifNoneMatch: string,
    skipConditional: boolean
  ): Promise<{ notModified: true } | { notModified: false; data: ModuleManifest; etag: string }> {
    bootLog('info', MODULE_LOG_PREFIX, `manifest:fetch:start mode=${skipConditional ? 'full' : 'conditional'} storedManifestEtag=${shortHash(ifNoneMatch || '')}`)
    const headers: Record<string, string> = {}
    if (!skipConditional && ifNoneMatch) {
      headers['If-None-Match'] = ifNoneMatch
    }
    return gmXhr({ method: 'GET', url: moduleManifestUrl, headers }).then((res) => {
      if (res.status === 304) {
        bootLog('info', MODULE_LOG_PREFIX, 'manifest:not-modified (304)')
        return { notModified: true as const }
      }
      if (res.status === 200 && res.responseText) {
        const data = JSON.parse(res.responseText) as ModuleManifest
        const etag = normalizeEtag(getResponseHeader(res, 'etag') ?? '')
        bootLog('info', MODULE_LOG_PREFIX, `manifest:fetch:success responseEtag=${shortHash(etag)}`)
        return { notModified: false as const, data, etag }
      }
      throw new Error(`manifest HTTP ${res.status}`)
    })
  }

  function persistManifestEtag(etag: string): void {
    if (etag) {
      writeScopedAndLegacy(scopedModuleManifestEtagKey, MODULE_MANIFEST_ETAG_KEY, etag)
    }
  }

  function applyScriptBundleUrlFromManifest(data: ModuleManifest | null, manifestNotModified: boolean): void {
    if (manifestNotModified) {
      const cachedUrl = readScopedValue(scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, '') as string
      if (cachedUrl) {
        runtimeScriptUrl = cachedUrl
        bootLog('info', MODULE_LOG_PREFIX, 'script-bundle:url:from-cache', cachedUrl.slice(0, 100))
      }
      return
    }
    const sb = extractScriptBundleModule(data)
    if (sb?.url) {
      runtimeScriptUrl = sb.url
      writeScopedAndLegacy(scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, sb.url)
      bootLog('info', MODULE_LOG_PREFIX, 'script-bundle:url:updated', sb.url.slice(0, 80))
    }
  }

  const storedBundleUrl = readScopedValue(scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, '') as string
  if (storedBundleUrl) {
    runtimeScriptUrl = storedBundleUrl
  }

  function applyPresetWithAtomicSwitch(presetText: string, normalizedHash: string): void {
    const activeHash = readScopedValue(scopedPresetActivatedHashKey, PRESET_ACTIVATED_HASH_KEY, '') as string
    const nextH = normalizedHash || ''
    if (activeHash && normalizedHash && activeHash !== normalizedHash) {
      writeScopedAndLegacy(scopedPresetPreviousHashKey, PRESET_PREVIOUS_HASH_KEY, activeHash)
    }
    if (normalizedHash) {
      writeScopedAndLegacy(scopedPresetActivatedHashKey, PRESET_ACTIVATED_HASH_KEY, normalizedHash)
      writeScopedAndLegacy(scopedPresetEtagKey, PRESET_ETAG_KEY, normalizedHash)
    }
    writeScopedAndLegacy(scopedPresetCacheKey, PRESET_CACHE_KEY, presetText)
    if (pendingManifestEtag) {
      persistManifestEtag(pendingManifestEtag)
      pendingManifestEtag = ''
    }
    bootLog('ok', MODULE_LOG_PREFIX, `activate:success hash ${shortHash(activeHash)} -> ${shortHash(nextH || activeHash)}`)
    runPreset(presetText)
  }

  function tryRollbackPreset(): boolean {
    const cached = readScopedValue(scopedPresetCacheKey, PRESET_CACHE_KEY, '') as string
    if (cached) {
      bootLog('warn', MODULE_LOG_PREFIX, `rollback:using-cached-preset bytes=${cached.length}`)
      runPreset(cached)
      return true
    }
    bootLog('fail', MODULE_LOG_PREFIX, 'rollback:failed:no-cache')
    return false
  }

  function shellNetworkOn(): boolean {
    const s = gm.GM_getValue(SHELL_NETWORK_ENABLED_KEY)
    if (s === true) return true
    if (s === false) return false
    return gm.GM_getValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY) === true
  }

  function requestPreset(fetchUrl: string, expectedHash: string, forceFullFetch: boolean, presetCode: string, localPresetHash: string): void {
    const url = fetchUrl || presetUrl
    const hdrs: Record<string, string> = {}
    if (!forceFullFetch && localPresetHash) {
      hdrs['If-None-Match'] = localPresetHash
    }
    bootLog('info', MODULE_LOG_PREFIX, `preset-core:fetch:start url=${url.slice(0, 120)}`)

    gm.GM_xmlhttpRequest({
      method: 'GET',
      url,
      headers: hdrs,
      onload: (res) => {
        if (res.status === 304) {
          if (pendingManifestEtag) {
            persistManifestEtag(pendingManifestEtag)
            pendingManifestEtag = ''
          }
          if (presetCode) {
            runPreset(presetCode)
          } else {
            loadAndRun(true)
          }
          return
        }
        if (res.status === 404) {
          pendingManifestEtag = ''
          if (!tryRollbackPreset()) {
            loadAndRun(true)
          }
          return
        }
        if (res.status === 200 && res.responseText) {
          const normalizedEtag = normalizeEtag(getResponseHeader(res, 'etag') ?? '')
          if (expectedHash && normalizedEtag && expectedHash !== normalizedEtag) {
            pendingManifestEtag = ''
            if (!tryRollbackPreset()) {
              bootLog('fail', MODULE_LOG_PREFIX, 'rollback failed: no cached preset')
            }
            return
          }
          applyPresetWithAtomicSwitch(res.responseText, normalizedEtag || expectedHash || '')
          return
        }
        pendingManifestEtag = ''
        if (!tryRollbackPreset()) {
          launcherLogger.error('failed to fetch preset, status:', res.status)
        }
      },
      onerror: () => {
        pendingManifestEtag = ''
        if (!tryRollbackPreset()) {
          launcherLogger.error('failed to fetch preset (network error)')
        }
      },
    })
  }

  function loadAndRun(skipConditionalRequest = false): void {
    pendingManifestEtag = ''
    let presetCode = readScopedValue(scopedPresetCacheKey, PRESET_CACHE_KEY, '') as string
    const localPresetHash = normalizeEtag(readScopedValue(scopedPresetEtagKey, PRESET_ETAG_KEY, '') as string)
    const manifestEtagStored = normalizeEtag(readScopedValue(scopedModuleManifestEtagKey, MODULE_MANIFEST_ETAG_KEY, '') as string)

    bootLog('info', MODULE_LOG_PREFIX, `load:start network=${shellNetworkOn() ? 'on' : 'off'} localPresetHash=${shortHash(localPresetHash)}`)

    if (!shellNetworkOn()) {
      if (presetCode) {
        runPreset(presetCode)
      } else {
        requestPreset(presetUrl, '', true, presetCode, localPresetHash)
      }
      return
    }

    if (skipConditionalRequest) {
      void fetchModuleManifestWithConditional('', true)
        .then((mres) => {
          let expectedHash = ''
          let presetMod: ManifestModule | null = null
          if (!mres.notModified && mres.data) {
            applyScriptBundleUrlFromManifest(mres.data, false)
            presetMod = extractPresetCoreModule(mres.data)
            expectedHash = hashFromPresetCoreModule(presetMod)
            if (mres.etag) pendingManifestEtag = mres.etag
          } else {
            applyScriptBundleUrlFromManifest(null, true)
          }
          const presetFetchUrl = presetMod?.url ?? presetUrl
          requestPreset(presetFetchUrl, expectedHash, true, presetCode, localPresetHash)
        })
        .catch(() => {
          requestPreset(presetUrl, localPresetHash, !localPresetHash, presetCode, localPresetHash)
        })
      return
    }

    void fetchModuleManifestWithConditional(manifestEtagStored, false)
      .then((mres) => {
        if (mres.notModified) {
          applyScriptBundleUrlFromManifest(null, true)
          pendingManifestEtag = ''
          if (presetCode) {
            runPreset(presetCode)
          } else {
            requestPreset(presetUrl, localPresetHash, true, presetCode, localPresetHash)
          }
          return
        }
        if (mres.etag) pendingManifestEtag = mres.etag
        applyScriptBundleUrlFromManifest(mres.data, false)
        const presetMod = extractPresetCoreModule(mres.data)
        const presetFetchUrl = presetMod?.url ?? presetUrl
        const remoteHash = hashFromPresetCoreModule(presetMod)
        if (remoteHash && localPresetHash && remoteHash === localPresetHash && presetCode) {
          if (pendingManifestEtag) {
            persistManifestEtag(pendingManifestEtag)
            pendingManifestEtag = ''
          }
          runPreset(presetCode)
          return
        }
        requestPreset(presetFetchUrl, remoteHash || localPresetHash, false, presetCode, localPresetHash)
      })
      .catch((err: Error) => {
        applyScriptBundleUrlFromManifest(null, true)
        bootLog('warn', MODULE_LOG_PREFIX, `manifest:fetch:failed ${err.message}`)
        requestPreset(presetUrl, localPresetHash, !localPresetHash, presetCode, localPresetHash)
      })
  }

  function resetRuntimeState(): void {
    const confirmed = window.confirm('Reset runtime state? This clears cached preset/script state and reloads this page.')
    if (!confirmed) return
    try {
      const shellNetwork = gm.GM_getValue(SHELL_NETWORK_ENABLED_KEY)
      const legacyAutoUpdate = gm.GM_getValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY)
      const keys = gm.GM_listValues()
      let removed = 0
      for (const key of keys) {
        if (typeof key === 'string' && key.startsWith(RUNTIME_STATE_KEY_PREFIX)) {
          gm.GM_deleteValue(key)
          removed++
        }
      }
      gm.GM_setValue(SHELL_NETWORK_ENABLED_KEY, shellNetwork === true || shellNetwork === false ? shellNetwork : true)
      if (legacyAutoUpdate === true || legacyAutoUpdate === false) {
        gm.GM_setValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY, legacyAutoUpdate)
      }
      launcherLogger.warn('Runtime state reset complete. Removed keys:', removed)
    } catch (e) {
      launcherLogger.error('Runtime state reset failed:', e)
    }
    setTimeout(() => location.reload(), 50)
  }

  gm.GM_addValueChangeListener(PRESET_UPDATE_CHANNEL_KEY, (_name, _oldVal, newVal) => {
    if (newVal == null || !shellNetworkOn()) return
    gm.GM_deleteValue(scopedPresetCacheKey)
    gm.GM_deleteValue(scopedPresetEtagKey)
    gm.GM_deleteValue(scopedPresetActivatedHashKey)
    gm.GM_deleteValue(scopedPresetPreviousHashKey)
    gm.GM_deleteValue(scopedModuleManifestEtagKey)
    gm.GM_deleteValue(scopedScriptBundleUrlKey)
    gm.GM_deleteValue(PRESET_CACHE_KEY)
    gm.GM_deleteValue(PRESET_ETAG_KEY)
    gm.GM_deleteValue(PRESET_ACTIVATED_HASH_KEY)
    gm.GM_deleteValue(PRESET_PREVIOUS_HASH_KEY)
    gm.GM_deleteValue(MODULE_MANIFEST_ETAG_KEY)
    gm.GM_deleteValue(SCRIPT_BUNDLE_URL_KEY)
    if (!isTabActive()) return
    gm.GM_setValue(scopedPresetUpdatedNotifyKey, 1)
    gm.GM_setValue(PRESET_UPDATED_NOTIFY_KEY, 1)
    setTimeout(() => {
      if (isTabActive()) location.reload()
    }, 300)
  })

  gm.GM_registerMenuCommand('Reset Runtime State', resetRuntimeState)
  loadAndRun()
}
