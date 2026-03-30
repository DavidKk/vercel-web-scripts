/**
 * Preset environment flags and init guard (IS_DEVELOP_MODE, IS_REMOTE_SCRIPT, WEB_SCRIPT_ID).
 */

import { GME_debug } from '@/helpers/logger'
import { GME_uuid } from '@/helpers/utils'

/** Window property key for init guard */
const WEB_SCRIPT_INIT_KEY = '__WEB_SCRIPT_INITIALIZED__'

/**
 * Get unique ID for this preset instance (used for menu IDs, etc.).
 * @returns UUID string
 */
export function getWebScriptId(): string {
  return GME_uuid()
}

/**
 * Get the same global object used by script-execution (so __IS_REMOTE_EXECUTE__ is read/write consistent).
 */
function getPresetGlobalForRemoteFlag(): unknown {
  if (typeof __GLOBAL__ !== 'undefined') return __GLOBAL__
  if (typeof globalThis !== 'undefined') return globalThis
  if (typeof window !== 'undefined') return window
  return undefined
}

/**
 * Whether the current script is the remote script (loaded by launcher from __SCRIPT_URL__).
 * Reads __IS_REMOTE_EXECUTE__ from the same global that script-execution sets (__GLOBAL__ or globalThis)
 * so re-entry from executeEditorScript is detected correctly.
 * @returns True when __IS_REMOTE_EXECUTE__ is true
 */
export function isRemoteScript(): boolean {
  const g = getPresetGlobalForRemoteFlag()
  if (!g || typeof g !== 'object') return false
  const v = (g as Record<string, unknown>).__IS_REMOTE_EXECUTE__
  return typeof v === 'boolean' && v
}

/**
 * Whether we are in development mode (same host as __HOSTNAME_PORT__).
 * Uses window.location.host to include port.
 * @returns True when __IS_DEVELOP_MODE__ and host matches
 */
export function isDevelopMode(): boolean {
  return !!(__IS_DEVELOP_MODE__ && __HOSTNAME_PORT__ === window.location.host)
}

interface DevProbeCache {
  at: number
  value: boolean
}

let devProbeCache: DevProbeCache | null = null

/**
 * Probe whether dev runtime (webpack HMR endpoint) is reachable.
 * Used when build-time __IS_DEVELOP_MODE__ is false but a dev server may coexist.
 * @param timeoutMs Probe timeout in milliseconds
 * @returns True when HMR websocket can be opened
 */
export async function detectDevelopModePresence(timeoutMs = 1200): Promise<boolean> {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return false
  }

  // Use a short-lived cache to avoid probing on every page init.
  const now = Date.now()
  if (devProbeCache && now - devProbeCache.at < 30_000) {
    return devProbeCache.value
  }

  const result = await new Promise<boolean>((resolve) => {
    let done = false
    const finish = (value: boolean) => {
      if (done) return
      done = true
      resolve(value)
    }

    let ws: WebSocket | null = null
    const timer = window.setTimeout(() => {
      try {
        ws?.close()
      } catch {
        // ignore
      }
      finish(false)
    }, timeoutMs)

    try {
      ws = new WebSocket(__HMK_URL__)
      ws.addEventListener('open', () => {
        clearTimeout(timer)
        try {
          ws?.close()
        } catch {
          // ignore
        }
        finish(true)
      })
      ws.addEventListener('error', () => {
        clearTimeout(timer)
        finish(false)
      })
      ws.addEventListener('close', () => {
        clearTimeout(timer)
        finish(false)
      })
    } catch {
      clearTimeout(timer)
      finish(false)
    }
  })

  devProbeCache = { at: now, value: result }
  return result
}

/**
 * Ensure single initialization: set window[WEB_SCRIPT_INIT_KEY] to scriptId if not already set.
 * Skip further init if already set (e.g. loader already running).
 * @param scriptId - ID to set (e.g. from getWebScriptId())
 * @returns True if this call performed the init, false if already initialized
 */
export function ensureWebScriptInitialized(scriptId: string): boolean {
  const w = typeof window !== 'undefined' ? (window as any) : undefined
  if (w && w[WEB_SCRIPT_INIT_KEY]) {
    GME_debug('[Main] Loader already running, skipping initialization')
    return false
  }
  if (w) {
    w[WEB_SCRIPT_INIT_KEY] = scriptId
  }
  return true
}
