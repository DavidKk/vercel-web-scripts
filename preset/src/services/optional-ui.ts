import { executeWithGlobal, executeWithGlobalResilient, isCspEvalError, isCspExtensionFallbackRequired } from '@shared/csp-script-executor'
import { buildPresetUiExecDecls, isLikelyPresetUiBundle } from '@shared/preset-launcher-decls'
import { isStaticModuleCacheStale } from '@shared/static-module-url'

import { isExtensionPageContext } from '@/helpers/env'
import { GME_fetch } from '@/helpers/http'
import { parseStaticKeyFromScriptUrl, readLauncherBaseUrl, readLauncherScriptKey, resolveLauncherScriptUrl, shortUrlLabel } from '@/helpers/launcher-script-url'
import { createGMELogger } from '@/helpers/logger'
import { handlePassiveOtaUpdate } from '@/services/ota-passive-update'
import { ensureRuntimeCore, type RuntimeCoreApi } from '@/services/runtime-core'
import { shouldLogToConsole } from '@/services/shell-log-settings'
import { isShellNetworkEnabled } from '@/services/shell-network-settings'
import { GME_notification } from '@/ui/notification/index'

/** Must match `PENDING_SEGMENT` in server `contentAddressedAssets` (unversioned preset-ui path segment). */
const STATIC_PENDING_SEGMENT = 'pending'

interface OptionalUiApi {
  openLogViewer?: () => void
  registerCommandPaletteCommand?: (command: unknown) => void
}

const OPTIONAL_UI_LOG_PREFIX = '[ModuleLoad][preset-ui]'
const { GME_debug, GME_warn } = createGMELogger('ModuleLoad:preset-ui')
const OPTIONAL_UI_CACHE_KEY_PREFIX = 'vws_optional_ui'
const OPTIONAL_UI_REFRESH_LOCK_KEY = 'vws_optional_ui_refreshing'
const OPTIONAL_UI_REFRESH_LOCK_TTL_MS = 15_000

/** Coalesce concurrent ensureOptionalUi() calls (avoids double CSP user-script global attempts). */
let ensureOptionalUiInflight: Promise<OptionalUiApi | null> | null = null

/**
 * Parse Tampermonkey script key for optional-ui cache scope.
 * @returns Key segment or null
 */
function resolveOptionalUiScriptKey(): string | null {
  const scriptUrl = resolveLauncherScriptUrl()
  return parseStaticKeyFromScriptUrl(scriptUrl) || readLauncherScriptKey() || null
}

/**
 * Build module-manifest.json URL from launcher globals.
 * @returns Absolute manifest URL or null when script key cannot be resolved
 */
function buildModuleManifestUrl(): string | null {
  try {
    const key = resolveOptionalUiScriptKey()
    if (!key) {
      return null
    }
    const base = readLauncherBaseUrl()
    if (!base) {
      return null
    }
    return `${base}/static/${key}/module-manifest.json`
  } catch {
    return null
  }
}

/**
 * @returns True when URL targets preset-ui.js (not script-bundle or preset-core).
 */
function isPresetUiModuleUrl(url: string): boolean {
  return /\/preset-ui\.js(?:$|[?#])/i.test(url)
}

/**
 * Resolve Preset UI script URL (content-addressed `?h=` when manifest provides it).
 * @returns Absolute URL to fetch for preset-ui.js, or null when base URL cannot be resolved
 */
async function resolvePresetUiScriptUrl(): Promise<string | null> {
  const staticKey = resolveOptionalUiScriptKey()
  const base = readLauncherBaseUrl()
  /** When key cannot be parsed, path still matches `/static/[key]/...` shape so the server returns 404 instead of a wrong route. */
  const keyForFallback = staticKey || '__missing_script_key__'
  const fallback = base.length > 0 ? `${base}/static/${keyForFallback}/${STATIC_PENDING_SEGMENT}/preset-ui.js` : null
  const manifestUrl = buildModuleManifestUrl()
  if (!manifestUrl) {
    return fallback
  }
  const response = await GME_fetch(manifestUrl, { method: 'GET' })
  if (!response.ok) {
    return fallback
  }
  const data = (await response.json()) as { modules?: { id?: string; url?: string }[] }
  const modules = data.modules
  if (!Array.isArray(modules)) {
    return fallback
  }
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i]
    if (mod && mod.id === 'preset-ui' && typeof mod.url === 'string' && mod.url.length > 0 && isPresetUiModuleUrl(mod.url)) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} resolve:url ${shortUrlLabel(mod.url, 120)}`)
      return mod.url
    }
  }
  GME_debug(`${OPTIONAL_UI_LOG_PREFIX} resolve:fallback manifest missing preset-ui url`)
  return fallback
}

/**
 * Log preset-ui load failure to console + log-store; show toast when the notification host is mounted.
 * @param context Short code (e.g. fetch status or error name)
 * @param technicalDetail Full detail for developers
 * @param userSummary Short message for the toast
 */
function reportPresetUiLoadFailure(context: string, technicalDetail: string, userSummary: string): void {
  const line = `${OPTIONAL_UI_LOG_PREFIX} ${context} ${technicalDetail}`
  if (shouldLogToConsole()) {
    // eslint-disable-next-line no-console -- explicit visibility when logger / UI not ready
    console.warn('[VWS][preset-ui]', context, technicalDetail)
  }
  GME_warn(line)
  try {
    const id = GME_notification(userSummary, 'warn', 8000)
    if (id == null) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} toast:skipped (notification host not ready)`)
    }
  } catch {
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} toast:failed`)
  }
}

interface OptionalUiCacheRecord {
  content: string
  url: string
  etag: string
}

function getOptionalUiScopeKey(): string {
  return resolveOptionalUiScriptKey() || '__default__'
}

function getOptionalUiCacheKeys(): { content: string; etag: string; url: string } {
  const scope = getOptionalUiScopeKey()
  return {
    content: `${OPTIONAL_UI_CACHE_KEY_PREFIX}:${scope}:content`,
    etag: `${OPTIONAL_UI_CACHE_KEY_PREFIX}:${scope}:etag`,
    url: `${OPTIONAL_UI_CACHE_KEY_PREFIX}:${scope}:url`,
  }
}

function readOptionalUiCache(): OptionalUiCacheRecord | null {
  try {
    const keys = getOptionalUiCacheKeys()
    const content = String(GM_getValue(keys.content, '') || '')
    if (!content) return null
    const etag = String(GM_getValue(keys.etag, '') || '')
    const url = String(GM_getValue(keys.url, '') || '')
    return { content, etag, url }
  } catch {
    return null
  }
}

function clearOptionalUiCache(): void {
  try {
    const keys = getOptionalUiCacheKeys()
    GM_deleteValue(keys.content)
    GM_deleteValue(keys.url)
    GM_deleteValue(keys.etag)
  } catch {
    /* ignore */
  }
}

function writeOptionalUiCache(content: string, url: string, etag: string): void {
  try {
    const keys = getOptionalUiCacheKeys()
    GM_setValue(keys.content, content)
    GM_setValue(keys.url, url)
    GM_setValue(keys.etag, etag)
  } catch {
    /* ignore cache write failures */
  }
}

function readRegisteredPresetUi(core: { get?: (id: string) => unknown } | undefined): OptionalUiApi | null {
  const loaded = core?.get ? (core.get('preset-ui') as OptionalUiApi | undefined) : undefined
  return loaded ?? null
}

function isRuntimeCoreLike(value: unknown): value is { get?: (id: string) => unknown } {
  return !!value && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function'
}

function getRuntimeCoreHosts(g: Record<string, unknown>): Record<string, unknown>[] {
  const hosts: Record<string, unknown>[] = [g]
  try {
    if (typeof __GLOBAL__ !== 'undefined' && __GLOBAL__ && __GLOBAL__ !== g) {
      hosts.push(__GLOBAL__ as unknown as Record<string, unknown>)
    }
  } catch {
    // __GLOBAL__ may be undeclared in some eval contexts
  }
  try {
    if (typeof globalThis !== 'undefined' && globalThis !== g) {
      hosts.push(globalThis as unknown as Record<string, unknown>)
    }
  } catch {
    // ignore
  }
  try {
    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
    const root = typeof globalThis !== 'undefined' ? (globalThis as unknown as Record<string, unknown>) : null
    if (win && win !== g && win !== root) {
      hosts.push(win)
    }
  } catch {
    // ignore
  }
  return hosts
}

function synchronizeRuntimeCoreHosts(g: Record<string, unknown>): void {
  const hosts = getRuntimeCoreHosts(g)
  const coreHost = hosts.find((host) => isRuntimeCoreLike(host.__VWS_CORE__))
  const core = coreHost?.__VWS_CORE__
  if (!core) {
    return
  }
  for (const host of hosts) {
    if (!isRuntimeCoreLike(host.__VWS_CORE__)) {
      host.__VWS_CORE__ = core
    }
  }
}

/**
 * Mirror runtime sandbox onto page MAIN world hosts so preset-ui bundle IIFEs can resolve __VWS_CORE__
 * when `__GLOBAL__` is unavailable in their lexical scope (CSP user-script path).
 * @param g Launcher sandbox
 * @param core Runtime core registry
 */
function mirrorPresetUiRuntimeToPageWorld(g: Record<string, unknown>, core: RuntimeCoreApi): void {
  g.__GLOBAL__ = g
  g.__VWS_CORE__ = core
  synchronizeRuntimeCoreHosts(g)
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>
      w.__GLOBAL__ = g
      w.__VWS_CORE__ = core
    }
  } catch {
    // ignore cross-realm access
  }
}

function formatRuntimeCoreRef(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return 'none'
  }
  const getFn = (value as { get?: unknown }).get
  const hasPresetUi = typeof getFn === 'function' ? Boolean((value as { get: (id: string) => unknown }).get('preset-ui')) : false
  return `obj preset-ui=${hasPresetUi ? 'yes' : 'no'}`
}

/** Temporary DEBUG: trace sandbox/core visibility across hosts during preset-ui load. */
function debugPresetUiRuntimeState(label: string, g: Record<string, unknown>, expectedCore: RuntimeCoreApi | undefined): void {
  const hosts = getRuntimeCoreHosts(g)
  const parts = hosts.map((host, index) => {
    const hostCore = host.__VWS_CORE__
    const same = hostCore === expectedCore
    return `[${index}]core=${formatRuntimeCoreRef(hostCore)} sameRef=${same ? 'yes' : 'no'}`
  })
  const globalDecl = (() => {
    try {
      return typeof __GLOBAL__ !== 'undefined' ? 'defined' : 'undefined'
    } catch {
      return 'error'
    }
  })()
  GME_debug(
    `${OPTIONAL_UI_LOG_PREFIX} debug:${label} globalDecl=${globalDecl} gCore=${formatRuntimeCoreRef(g.__VWS_CORE__)} expected=${formatRuntimeCoreRef(expectedCore)} hosts=${parts.join(' ')}`
  )
}

function readRegisteredPresetUiFromGlobal(g: Record<string, unknown>): OptionalUiApi | null {
  for (const host of getRuntimeCoreHosts(g)) {
    const loaded = readRegisteredPresetUi(host.__VWS_CORE__ as { get?: (id: string) => unknown } | undefined)
    if (loaded) {
      if (!isRuntimeCoreLike(g.__VWS_CORE__) && isRuntimeCoreLike(host.__VWS_CORE__)) {
        g.__VWS_CORE__ = host.__VWS_CORE__
      }
      return loaded
    }
  }
  return null
}

function reportFinishedWithoutRegister(): void {
  reportPresetUiLoadFailure(
    'execute:finished-without-register',
    'Script ran but did not register preset-ui on __VWS_CORE__ (bundle may be wrong or threw before register).',
    'Optional UI script ran but did not register. Rebuild preset-ui or check the bundle.'
  )
}

async function executeOptionalUiContent(content: string, sourceUrl?: string): Promise<OptionalUiApi | null> {
  if (!isLikelyPresetUiBundle(content)) {
    reportPresetUiLoadFailure(
      'execute:invalid-bundle',
      `bytes=${content?.length ?? 0} url=${shortUrlLabel(sourceUrl ?? '', 120) || '(unknown)'}`,
      'Optional UI bundle looks invalid (wrong file or truncated download). Use Reset Runtime State or Update runtime to refetch.'
    )
    return null
  }
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as Record<string, unknown>
  const core = ensureRuntimeCore()
  mirrorPresetUiRuntimeToPageWorld(g, core)
  debugPresetUiRuntimeState('execute:before', g, core)
  const body = `${buildPresetUiExecDecls()}\n${content}`
  GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:start bytes=${content.length} url=${shortUrlLabel(sourceUrl ?? '', 120) || '(cache)'}`)
  try {
    const mode = isExtensionPageContext() ? await executeWithGlobalResilient(g, body, { preferUserScript: true }) : executeWithGlobal(g, body)
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:mode=${mode}`)
    debugPresetUiRuntimeState('execute:after-sync', g, core)
    const loaded = readRegisteredPresetUiFromGlobal(g) || readRegisteredPresetUi(core)
    if (!loaded) {
      reportFinishedWithoutRegister()
    }
    return loaded
  } catch (error) {
    if (isCspExtensionFallbackRequired(error)) {
      try {
        mirrorPresetUiRuntimeToPageWorld(g, core)
        debugPresetUiRuntimeState('execute:before-user-script', g, core)
        const mode = await executeWithGlobalResilient(g, body)
        GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:mode=${mode}`)
        debugPresetUiRuntimeState('execute:after-user-script', g, core)
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        reportPresetUiLoadFailure('execute:csp-fallback-failed', message, `Optional UI CSP extension fallback failed: ${message.slice(0, 120)}`)
        return null
      }
      synchronizeRuntimeCoreHosts(g)
      const loaded = readRegisteredPresetUiFromGlobal(g) || readRegisteredPresetUi(core)
      if (!loaded) {
        debugPresetUiRuntimeState('execute:finished-without-register', g, core)
        reportFinishedWithoutRegister()
      }
      return loaded
    }
    const message = error instanceof Error ? error.message : String(error)
    const context = isCspEvalError(error) ? 'execute:csp-fallback-failed' : 'execute:cache-exception'
    reportPresetUiLoadFailure(context, message, `Optional UI cache execution error: ${message.slice(0, 120)}`)
    return null
  }
}

async function refreshOptionalUiInBackground(previousCache: OptionalUiCacheRecord | null): Promise<void> {
  if (!isShellNetworkEnabled()) return
  const now = Date.now()
  const lockUntil = Number(GM_getValue(OPTIONAL_UI_REFRESH_LOCK_KEY, 0))
  if (Number.isFinite(lockUntil) && lockUntil > now) return

  GM_setValue(OPTIONAL_UI_REFRESH_LOCK_KEY, now + OPTIONAL_UI_REFRESH_LOCK_TTL_MS)
  try {
    const url = await resolvePresetUiScriptUrl()
    if (!url) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} refresh:skip no-url base=${readLauncherBaseUrl() || '(none)'} key=${resolveOptionalUiScriptKey() || '(none)'}`)
      return
    }
    const headers: Record<string, string> = {}
    if (previousCache?.etag) {
      headers['If-None-Match'] = previousCache.etag
    }
    const response = await GME_fetch(url, { method: 'GET', headers })

    if (response.status === 304) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} refresh:not-modified`)
      return
    }
    if (!response.ok) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} refresh:skip status=${response.status}`)
      return
    }

    const etag = String(response.headers.get('etag') || '').trim()
    const content = await response.text()
    if (!content) return

    const changed = !previousCache || previousCache.content !== content
    writeOptionalUiCache(content, url, etag)
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} refresh:cached bytes=${content.length} changed=${changed ? 'yes' : 'no'}`)

    if (changed) {
      handlePassiveOtaUpdate('optional-ui', Boolean(previousCache?.content))
    }
  } catch (error) {
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} refresh:error ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    GM_setValue(OPTIONAL_UI_REFRESH_LOCK_KEY, 0)
  }
}

/**
 * Ensure optional UI runtime is loaded, then return its API.
 * @returns Optional UI API if available
 */
export async function ensureOptionalUi(): Promise<OptionalUiApi | null> {
  if (ensureOptionalUiInflight) {
    return ensureOptionalUiInflight
  }
  ensureOptionalUiInflight = ensureOptionalUiOnce().finally(() => {
    ensureOptionalUiInflight = null
  })
  return ensureOptionalUiInflight
}

async function ensureOptionalUiOnce(): Promise<OptionalUiApi | null> {
  GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:start`)
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as any
  const core = g.__VWS_CORE__
  if (core?.get) {
    const existing = core.get('preset-ui') as OptionalUiApi | undefined
    if (existing) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:cache-hit`)
      return existing
    }
  }

  // Prefer local cache for instant availability; refresh in background when network is on.
  const manifestUrl = isShellNetworkEnabled() ? await resolvePresetUiScriptUrl() : null
  const cache = readOptionalUiCache()
  if (cache?.content) {
    if (!isLikelyPresetUiBundle(cache.content) || isStaticModuleCacheStale(cache.url, manifestUrl, 'preset-ui.js')) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:cache-stale clearing invalid or outdated cached bytes=${cache.content.length}`)
      clearOptionalUiCache()
    } else {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:cache-first bytes=${cache.content.length} url=${shortUrlLabel(cache.url, 120) || '(none)'}`)
      const loadedFromCache = await executeOptionalUiContent(cache.content, cache.url)
      if (loadedFromCache) {
        GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:cache-hit`)
        void refreshOptionalUiInBackground(cache)
        return loadedFromCache
      }
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:cache-register-failed clearing cache and retrying network`)
      clearOptionalUiCache()
    }
  }

  if (!isShellNetworkEnabled()) {
    const msg = `${OPTIONAL_UI_LOG_PREFIX} load:skip:network-off`
    if (shouldLogToConsole()) {
      // eslint-disable-next-line no-console -- match user request for visible console output
      console.warn('[VWS][preset-ui]', msg)
    }
    GME_warn(msg)
    return null
  }
  try {
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} fetch:start`)
    const url = await resolvePresetUiScriptUrl()
    if (!url) {
      reportPresetUiLoadFailure(
        'fetch:no-url',
        `base=${readLauncherBaseUrl() || '(none)'} key=${resolveOptionalUiScriptKey() || '(none)'} — cannot resolve preset-ui URL (check __BASE_URL__ / module-manifest)`,
        'Optional UI URL could not be resolved. Reload the page or use Reset Runtime State.'
      )
      return null
    }
    const response = await GME_fetch(url, { method: 'GET' })
    if (!response.ok) {
      const hint = response.status === 503 || response.status === 500 ? 'Often means preset-ui was not built (pnpm run build:preset).' : 'Check network and module-manifest URL.'
      reportPresetUiLoadFailure(
        `fetch:failed:status:${response.status}`,
        `url=${url.slice(0, 160)}${url.length > 160 ? '...' : ''} ${hint}`,
        `Optional UI failed to load (HTTP ${response.status}). ${hint} See console / Log Viewer.`
      )
      return null
    }
    const content = await response.text()
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} fetch:success bytes=${content.length} url=${shortUrlLabel(url, 120)}`)
    if (!isLikelyPresetUiBundle(content)) {
      reportPresetUiLoadFailure(
        'fetch:invalid-bundle',
        `bytes=${content.length} url=${shortUrlLabel(url, 120)} (response is not preset-ui.js — check module-manifest preset-ui url)`,
        'Optional UI download looks invalid. Use Reset Runtime State, then hard-refresh the page.'
      )
      return null
    }
    const etag = String(response.headers.get('etag') || '').trim()
    const loaded = await executeOptionalUiContent(content, url)
    if (loaded) {
      writeOptionalUiCache(content, url, etag)
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:success`)
    }
    return loaded
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportPresetUiLoadFailure('load:exception', message, `Optional UI load error: ${message.slice(0, 120)}`)
    return null
  }
}

/**
 * Open optional UI log viewer if available.
 * @returns Promise that resolves when action completes
 */
export async function openOptionalLogViewer(): Promise<void> {
  const api = await ensureOptionalUi()
  if (api?.openLogViewer) {
    api.openLogViewer()
    return
  }
  /** Load failures already call {@link reportPresetUiLoadFailure} (toast + console). Network-off only logs here. */
  if (isShellNetworkEnabled()) {
    GME_debug('[Optional UI] Log viewer unavailable after load attempt (see prior warnings).')
    return
  }
  const msg = '[Optional UI] Log viewer needs Shell network enabled once to fetch preset-ui.'
  if (shouldLogToConsole()) {
    // eslint-disable-next-line no-console -- user explicitly opened log viewer
    console.warn('[VWS][preset-ui]', msg)
  }
  GME_warn(msg)
  try {
    GME_notification(msg, 'warn', 7000)
  } catch {
    /* ignore */
  }
}
