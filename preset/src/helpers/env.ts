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
