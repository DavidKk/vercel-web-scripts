/**
 * Shared GM_setValue keys and preset-related constants.
 * Keys must match launcherScript (services/tampermonkey) when preset is loaded by launcher.
 */

/** GM_setValue key for preset cache (must match launcherScript.PRESET_CACHE_KEY) */
export const PRESET_CACHE_KEY = 'vws_preset_cache'
/** GM_setValue key: set before reload so we show "Preset updated" after reload (must match launcherScript.PRESET_UPDATED_NOTIFY_KEY) */
export const PRESET_UPDATED_NOTIFY_KEY = 'vws_preset_updated_notify'
/** GM_setValue key: last SSE preset-built message hash, only update when hash changes */
export const PRESET_BUILT_HASH_KEY = 'vws_preset_built_hash'

/** Reconnect delay (ms) when preset-built SSE connection closes or errors */
export const PRESET_BUILT_SSE_RECONNECT_MS = 2000

/** Poll interval (ms) for preset-built when using GM_xmlhttpRequest (no streaming SSE in Tampermonkey) */
export const PRESET_BUILT_POLL_MS = 3000
