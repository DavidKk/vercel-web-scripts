import { createGMELogger } from '@/helpers/logger'
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

/**
 * Parse Tampermonkey script key from remote or launcher URL under `/static/[key]/...`.
 * @param scriptUrl Full script URL
 * @returns Key segment or null
 */
function parseStaticKeyFromScriptUrl(scriptUrl: string): string | null {
  const remote = scriptUrl.match(/\/static\/([^/]+)\/(?:[a-f0-9]{40}\/)?tampermonkey-remote\.js(?:$|[?#])/i)
  if (remote?.[1]) {
    return remote[1]
  }
  const launcher = scriptUrl.match(/\/static\/([^/]+)\/tampermonkey\.user\.js(?:$|[?#])/i)
  return launcher?.[1] ?? null
}

/**
 * Build module-manifest.json URL from the configured remote script URL.
 * @returns Absolute manifest URL or null when script URL shape is unknown
 */
function buildModuleManifestUrl(): string | null {
  try {
    const scriptUrl = String(typeof __SCRIPT_URL__ !== 'undefined' ? __SCRIPT_URL__ : '')
    const key = parseStaticKeyFromScriptUrl(scriptUrl)
    if (!key) {
      return null
    }
    const base = String(typeof __BASE_URL__ !== 'undefined' ? __BASE_URL__ : '')
    if (!base) {
      return null
    }
    return `${base}/static/${key}/module-manifest.json`
  } catch {
    return null
  }
}

/**
 * Resolve Preset UI script URL (content-addressed `?h=` when manifest provides it).
 * @returns Absolute URL to fetch for preset-ui.js
 */
async function resolvePresetUiScriptUrl(): Promise<string> {
  const scriptUrlForKey = String(typeof __SCRIPT_URL__ !== 'undefined' ? __SCRIPT_URL__ : '')
  const staticKey = parseStaticKeyFromScriptUrl(scriptUrlForKey)
  const base = String(typeof __BASE_URL__ !== 'undefined' ? __BASE_URL__ : '')
  /** When key cannot be parsed, path still matches `/static/[key]/...` shape so the server returns 404 instead of a wrong route. */
  const keyForFallback = staticKey || '__missing_script_key__'
  const fallback = base.length > 0 ? `${base}/static/${keyForFallback}/${STATIC_PENDING_SEGMENT}/preset-ui.js` : ''
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
    if (mod && mod.id === 'preset-ui' && typeof mod.url === 'string' && mod.url.length > 0) {
      return mod.url
    }
  }
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
  // eslint-disable-next-line no-console -- explicit visibility when logger / UI not ready
  console.warn('[VWS][preset-ui]', context, technicalDetail)
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
  const scriptUrl = String(typeof __SCRIPT_URL__ !== 'undefined' ? __SCRIPT_URL__ : '')
  const key = parseStaticKeyFromScriptUrl(scriptUrl)
  return key || '__default__'
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

function executeOptionalUiContent(content: string): OptionalUiApi | null {
  try {
    const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as any
    const core = g.__VWS_CORE__
    const execute = new Function('global', `with(global){${content}}`)
    execute(g)
    const loaded = core?.get ? (core.get('preset-ui') as OptionalUiApi | undefined) : undefined
    return loaded ?? null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportPresetUiLoadFailure('execute:cache-exception', message, `Optional UI cache execution error: ${message.slice(0, 120)}`)
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

    // Follow "cache first, update in background, then refresh" contract.
    const pageVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    if (changed && typeof window !== 'undefined' && pageVisible) {
      window.location.reload()
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
  const cache = readOptionalUiCache()
  if (cache?.content) {
    const loadedFromCache = executeOptionalUiContent(cache.content)
    if (loadedFromCache) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} load:cache-hit`)
      void refreshOptionalUiInBackground(cache)
      return loadedFromCache
    }
  }

  if (!isShellNetworkEnabled()) {
    const msg = `${OPTIONAL_UI_LOG_PREFIX} load:skip:network-off`
    // eslint-disable-next-line no-console -- match user request for visible console output
    console.warn('[VWS][preset-ui]', msg)
    GME_warn(msg)
    return null
  }
  try {
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} fetch:start`)
    const url = await resolvePresetUiScriptUrl()
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
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} fetch:success bytes=${content.length}`)
    const etag = String(response.headers.get('etag') || '').trim()
    writeOptionalUiCache(content, url, etag)
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:start`)
    const loaded = executeOptionalUiContent(content) ?? undefined
    if (loaded) {
      GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:success`)
    } else {
      reportPresetUiLoadFailure(
        'execute:finished-without-register',
        'Script ran but did not register preset-ui on __VWS_CORE__ (bundle may be wrong or threw before register).',
        'Optional UI script ran but did not register. Rebuild preset-ui or check the bundle.'
      )
    }
    return loaded ?? null
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
  // eslint-disable-next-line no-console -- user explicitly opened log viewer
  console.warn('[VWS][preset-ui]', msg)
  GME_warn(msg)
  try {
    GME_notification(msg, 'warn', 7000)
  } catch {
    /* ignore */
  }
}
