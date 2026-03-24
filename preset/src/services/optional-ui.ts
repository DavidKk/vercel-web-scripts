import { createGMELogger } from '@/helpers/logger'
import { isShellNetworkEnabled } from '@/services/shell-network-settings'
import { GME_notification } from '@/ui/notification/index'

/** Must match `PENDING_SEGMENT` in server `contentAddressedAssets` (unversioned preset-ui path segment). */
const STATIC_PENDING_SEGMENT = 'pending'

interface OptionalUiApi {
  openLogViewer?: () => void
}

const OPTIONAL_UI_LOG_PREFIX = '[ModuleLoad][preset-ui]'
const { GME_debug, GME_warn } = createGMELogger('ModuleLoad:preset-ui')

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
    GME_debug(`${OPTIONAL_UI_LOG_PREFIX} execute:start`)
    const execute = new Function('global', `with(global){${content}}`)
    execute(g)
    const loaded = core?.get ? (core.get('preset-ui') as OptionalUiApi | undefined) : undefined
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
