/**
 * Page-world host: GM APIs, preset execution, duplicate-run guards — no manifest/preset fetch.
 */

import { launcherLogger } from '@ext/shared/logger'
import {
  BOOT_LOG_KEY,
  BOOT_LOG_MAX,
  LEGACY_AUTO_UPDATE_SCRIPT_KEY,
  MODULE_LOG_PREFIX,
  PRESET_CACHE_KEY,
  PRESET_UPDATE_CHANNEL_KEY,
  SCRIPT_BUNDLE_URL_KEY,
  SHELL_NETWORK_ENABLED_KEY,
} from '@shared/launcher-constants'
import {
  isPassiveOtaNotifyLocked,
  nextPassiveOtaNotifyLockExpiry,
  OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY,
  OTA_PASSIVE_UPDATE_PENDING_KEY,
  type OtaPassiveUpdateKind,
  passiveOtaUpdateUserMessage,
  resolvePassiveOtaUpdateAction,
} from '@shared/ota-passive-update'
import { ensurePresetCoreInjectionGate } from '@shared/preset-core-injection-gate'
import { buildPresetLauncherDecls } from '@shared/preset-launcher-decls'
import { clearAllRuntimeGmCaches } from '@shared/runtime-cache-clear'
import { SCRIPT_CONTENT_HASH_MAP_KEY } from '@shared/script-permission-scope'
import { PRESET_CORE_SCRIPT_FILE, reportExtensionScriptFailed } from '@shared/script-trigger-log'

import { BRIDGE_MESSAGE_SOURCE, RUNTIME_LOAD_FAILED_MESSAGE_TYPE, RUNTIME_PRESET_READY_MESSAGE_TYPE } from '../bridge/runtime-messages'
import type { RuntimeLoadFailedPayload, RuntimePresetReadyPayload } from '../runtime/loader-types'
import type { LauncherUrls } from './config'
import { PRESET_VAR_NAMES } from './config'
import { setActiveGmScope } from './gm-bridge'
import type { GMApi } from './gm-types'
import { executePresetWithGResilient, isCspUserScriptExhausted } from './preset-executor'

export interface PageHostStartOptions {
  scriptKey: string
  gmScope: string
  enabledScripts?: Record<string, boolean>
  contentHashByFile?: Record<string, string>
  acceptAlphaByFile?: Record<string, boolean>
  acceptAlpha?: boolean
  logPrefix?: string
  urls: LauncherUrls
  /** Bootstrap-time load result from background (avoids READY race). */
  initialReady?: RuntimePresetReadyPayload
  /** Bootstrap-time load failure from background. */
  initialFailed?: RuntimeLoadFailedPayload
}

const PRESET_RUN_ATTEMPTED_PREFIX = '__VWS_PRESET_RUN_ATTEMPTED__'
const PRESET_IN_FLIGHT_PREFIX = '__VWS_PRESET_EXECUTE_IN_FLIGHT__'
const PASSIVE_OTA_VISIBILITY_FLAG = '__VWS_PAGE_HOST_PASSIVE_OTA_VISIBILITY__'

function guardKey(prefix: string, scriptKey: string): string {
  return `${prefix}:${scriptKey}`
}

/**
 * Start page host for one scriptKey: listen for background loader, execute preset from GM cache.
 */
export function startPageHost(gm: GMApi, options: PageHostStartOptions): void {
  const logPrefix = options.logPrefix ?? MODULE_LOG_PREFIX
  const { scriptKey, gmScope, enabledScripts = {}, contentHashByFile = {}, urls } = options

  setActiveGmScope(gmScope)
  ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = scriptKey
  ;(globalThis as Record<string, unknown>)[SCRIPT_CONTENT_HASH_MAP_KEY] = contentHashByFile

  const { cacheScope, scopedPresetCacheKey, scopedScriptBundleUrlKey, globals } = urls

  let runtimeScriptUrl = resolveRuntimeScriptUrl(gm, scopedScriptBundleUrlKey, globals)
  let lastScriptPolicies: RuntimePresetReadyPayload['scriptPolicies'] = {}
  let otaManualUpdateForLoad = false
  let presetExecuted = false

  function isPresetRunAttempted(): boolean {
    return (globalThis as Record<string, unknown>)[guardKey(PRESET_RUN_ATTEMPTED_PREFIX, scriptKey)] === true
  }

  function markPresetRunAttempted(): void {
    ;(globalThis as Record<string, unknown>)[guardKey(PRESET_RUN_ATTEMPTED_PREFIX, scriptKey)] = true
  }

  function isPresetExecuteInFlight(): boolean {
    return (globalThis as Record<string, unknown>)[guardKey(PRESET_IN_FLIGHT_PREFIX, scriptKey)] === true
  }

  function setPresetExecuteInFlight(inFlight: boolean): void {
    ;(globalThis as Record<string, unknown>)[guardKey(PRESET_IN_FLIGHT_PREFIX, scriptKey)] = inFlight
  }

  function bootLog(level: 'info' | 'warn' | 'fail' | 'ok', ...parts: unknown[]): void {
    const msg = parts
      .map((x) => (x === undefined || x === null ? '' : String(x)))
      .join(' ')
      .trim()
    const labeled = msg.startsWith('[') ? msg : `${logPrefix} ${msg}`
    if (level === 'fail') {
      launcherLogger.error(labeled)
    } else if (level === 'warn') {
      launcherLogger.warn(labeled)
    } else if (level === 'ok') {
      launcherLogger.ok(labeled)
    } else {
      launcherLogger.info(labeled)
    }
    try {
      const root = globalThis as Record<string, unknown>
      if (!Array.isArray(root[BOOT_LOG_KEY])) {
        root[BOOT_LOG_KEY] = []
      }
      const arr = root[BOOT_LOG_KEY] as { t: number; level: string; message: string }[]
      if (arr.length >= BOOT_LOG_MAX) arr.shift()
      arr.push({ t: Date.now(), level, message: labeled })
    } catch {
      // ignore
    }
  }

  function readScopedValue(scopedKey: string, legacyKey: string, defaultValue: unknown): unknown {
    const scoped = gm.GM_getValue(scopedKey, null)
    if (scoped !== null && scoped !== undefined && scoped !== '') {
      return scoped
    }
    return gm.GM_getValue(legacyKey, defaultValue)
  }

  function shellNetworkOn(): boolean {
    const s = gm.GM_getValue(SHELL_NETWORK_ENABLED_KEY)
    if (s === true) return true
    if (s === false) return false
    return gm.GM_getValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY) === true
  }

  function isPageVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible'
  }

  function showPassiveOtaToast(kind: OtaPassiveUpdateKind): void {
    const now = Date.now()
    const lockUntil = gm.GM_getValue(OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY, 0)
    if (isPassiveOtaNotifyLocked(lockUntil, now)) {
      return
    }
    gm.GM_setValue(OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY, nextPassiveOtaNotifyLockExpiry(now))
    const message = passiveOtaUpdateUserMessage(kind)
    const notify = (globalThis as Record<string, unknown>).GME_notification
    if (typeof notify === 'function') {
      ;(notify as (msg: string, type: string, ms: number) => void)(message, 'info', 8000)
    } else {
      launcherLogger.info(message)
    }
  }

  function ensurePassiveOtaVisibilityListener(): void {
    if (typeof document === 'undefined') {
      return
    }
    const root = globalThis as Record<string, unknown>
    if (root[PASSIVE_OTA_VISIBILITY_FLAG]) {
      return
    }
    root[PASSIVE_OTA_VISIBILITY_FLAG] = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        return
      }
      const kind = gm.GM_getValue(OTA_PASSIVE_UPDATE_PENDING_KEY, '') as OtaPassiveUpdateKind | ''
      if (!kind) {
        return
      }
      gm.GM_deleteValue(OTA_PASSIVE_UPDATE_PENDING_KEY)
      showPassiveOtaToast(kind)
    })
  }

  function handlePassiveOtaUpdate(kind: OtaPassiveUpdateKind, manualUpdate: boolean, reloadReason: string): void {
    const action = resolvePassiveOtaUpdateAction(presetExecuted, manualUpdate)
    if (action === 'reload') {
      bootLog('info', reloadReason)
      if (isPageVisible()) {
        setTimeout(() => location.reload(), 50)
      }
      return
    }
    if (!isPageVisible()) {
      gm.GM_setValue(OTA_PASSIVE_UPDATE_PENDING_KEY, kind)
      ensurePassiveOtaVisibilityListener()
      bootLog('info', `passive-ota:notify-deferred kind=${kind}`)
      return
    }
    showPassiveOtaToast(kind)
  }

  function resolvePayloadGlobals(payloadGlobals: Record<string, string | boolean>): Record<string, string | boolean> {
    const storedBundle = readScopedValue(scopedScriptBundleUrlKey, SCRIPT_BUNDLE_URL_KEY, '') as string
    const g = { ...payloadGlobals }
    const url = String(runtimeScriptUrl || storedBundle || g.__SCRIPT_URL__ || '').trim()
    if (url) {
      g.__SCRIPT_URL__ = url
      runtimeScriptUrl = url
    }
    return g
  }

  function assignGlobals(g: Record<string, unknown>, payloadGlobals: Record<string, string | boolean>): void {
    for (const [k, v] of Object.entries(payloadGlobals)) {
      g[k] = v
    }
    const scriptUrl = String(runtimeScriptUrl || payloadGlobals.__SCRIPT_URL__ || '').trim()
    if (scriptUrl) {
      g.__SCRIPT_URL__ = scriptUrl
    }
  }

  function reportPresetFailure(): void {
    reportExtensionScriptFailed(PRESET_CORE_SCRIPT_FILE, 'failed', scriptKey)
  }

  function runPreset(presetCode: string, payloadGlobals: Record<string, string | boolean>): void {
    const injectionGate = ensurePresetCoreInjectionGate()
    if (isPresetRunAttempted() || isPresetExecuteInFlight()) {
      bootLog('info', `execute:skipped duplicate bytes=${presetCode?.length ?? 0}`)
      return
    }
    markPresetRunAttempted()
    const bytes = presetCode?.length ?? 0
    bootLog('info', `execute:start bytes=${bytes}`)
    const g = globalThis as Record<string, unknown>
    assignGlobals(g, payloadGlobals)
    g.__GLOBAL__ = g
    g.__VWS_SCRIPT_KEY__ = scriptKey
    g.__VWS_ENABLED_SCRIPTS__ = enabledScripts
    g.__VWS_SCRIPT_POLICIES__ = lastScriptPolicies
    g.__VWS_OTA_MANUAL_UPDATE__ = otaManualUpdateForLoad
    setActiveGmScope(gmScope)
    const decls = buildPresetLauncherDecls(PRESET_VAR_NAMES)
    setPresetExecuteInFlight(true)
    void executePresetWithGResilient(g, decls, presetCode, {
      gmScope,
      scriptKey,
      enabledScripts,
      launcherGlobals: { ...payloadGlobals, __SCRIPT_URL__: runtimeScriptUrl },
      preferUserScript: true,
    })
      .then((mode) => {
        presetExecuted = true
        if (mode === 'csp-reload') {
          bootLog('info', 'execute:csp-reload tab reload scheduled (DNR strips CSP on next load)')
          return
        }
        bootLog('ok', `execute:success bytes=${bytes} mode=${mode}`)
      })
      .catch((fallbackError) => {
        const em = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        if (isCspUserScriptExhausted(fallbackError)) {
          bootLog('fail', 'execute:failed', `${em} (user-script fallback already attempted this load)`)
        } else {
          bootLog('fail', 'execute:failed', `${em} (CSP: user-script fallback failed)`)
        }
        launcherLogger.error(`[${scriptKey}] preset run failed:`, em, fallbackError)
        reportPresetFailure()
      })
      .finally(() => {
        setPresetExecuteInFlight(false)
        injectionGate.markReady()
      })
  }

  function resolvePresetText(payload?: RuntimePresetReadyPayload): string {
    if (payload?.presetText) {
      return payload.presetText
    }
    return readScopedValue(scopedPresetCacheKey, PRESET_CACHE_KEY, '') as string
  }

  function handlePresetReady(payload: RuntimePresetReadyPayload): void {
    if (payload.scriptKey !== scriptKey) {
      return
    }
    runtimeScriptUrl = payload.runtimeScriptUrl || runtimeScriptUrl
    lastScriptPolicies = payload.scriptPolicies
    otaManualUpdateForLoad = payload.otaManualUpdate
    const payloadGlobals = resolvePayloadGlobals(payload.globals)
    bootLog('info', 'runtime:preset-ready from background loader')

    if (payload.presetContentChanged && presetExecuted) {
      handlePassiveOtaUpdate('preset-core', otaManualUpdateForLoad, 'refresh:preset-changed reload')
      return
    }

    const presetCode = resolvePresetText(payload)
    if (!presetCode) {
      bootLog('warn', 'runtime:preset-ready but no preset body in cache')
      return
    }
    runPreset(presetCode, payloadGlobals)
  }

  function handleLoadFailed(payload: RuntimeLoadFailedPayload): void {
    if (payload.scriptKey !== scriptKey) {
      return
    }
    bootLog('warn', 'runtime:load-failed — trying cached preset rollback')
    const payloadGlobals = resolvePayloadGlobals(globals)
    const presetCode = resolvePresetText()
    if (presetCode) {
      runPreset(presetCode, payloadGlobals)
    }
  }

  function onRuntimeMessage(event: MessageEvent): void {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return
    }
    const data = event.data as { source?: string; type?: string; payload?: unknown }
    if (data.source !== BRIDGE_MESSAGE_SOURCE) {
      return
    }
    if (data.type === RUNTIME_PRESET_READY_MESSAGE_TYPE) {
      handlePresetReady(data.payload as RuntimePresetReadyPayload)
    } else if (data.type === RUNTIME_LOAD_FAILED_MESSAGE_TYPE) {
      handleLoadFailed(data.payload as RuntimeLoadFailedPayload)
    }
  }

  window.addEventListener('message', onRuntimeMessage)

  gm.GM_addValueChangeListener(PRESET_UPDATE_CHANNEL_KEY, (_name, _oldVal, newVal) => {
    if (newVal == null || !shellNetworkOn()) {
      return
    }
    handlePassiveOtaUpdate('runtime', false, 'refresh:preset-channel reload')
  })

  function resetRuntimeState(): void {
    const confirmed = window.confirm('Reset runtime state? This clears all OTA caches (preset, remote script, optional UI, rules) and reloads this page.')
    if (!confirmed) return
    try {
      const removed = clearAllRuntimeGmCaches({
        listValues: () => gm.GM_listValues(),
        getValue: (key) => gm.GM_getValue(key),
        deleteValue: (key) => gm.GM_deleteValue(key),
        setValue: (key, value) => gm.GM_setValue(key, value),
      })
      launcherLogger.warn('Runtime state reset complete. Removed keys:', removed)
    } catch (e) {
      launcherLogger.error('Runtime state reset failed:', e)
    }
    setTimeout(() => location.reload(), 50)
  }

  gm.GM_registerMenuCommand('Reset Runtime State', resetRuntimeState)

  bootLog('info', `host:waiting scope=${cacheScope}`)
  if (options.initialReady) {
    handlePresetReady(options.initialReady)
  } else if (options.initialFailed) {
    handleLoadFailed(options.initialFailed)
  }
}

function resolveRuntimeScriptUrl(gm: GMApi, scopedScriptBundleUrlKey: string, globals: Record<string, string | boolean>): string {
  const scoped = gm.GM_getValue(scopedScriptBundleUrlKey, '')
  const legacy = gm.GM_getValue(SCRIPT_BUNDLE_URL_KEY, '')
  const raw = typeof scoped === 'string' && scoped.trim() ? scoped : legacy
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim()
  }
  return String(globals.__SCRIPT_URL__ || '')
}
