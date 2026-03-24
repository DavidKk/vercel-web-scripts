/**
 * Shared GM_setValue keys and preset-related constants.
 * Keys must match launcherScript (services/tampermonkey) when preset is loaded by launcher.
 */

/** GM_setValue key for preset cache (must match launcherScript.PRESET_CACHE_KEY) */
export const PRESET_CACHE_KEY = 'vws_preset_cache'
/** GM_setValue key: preset body ETag (must match launcherScript.PRESET_ETAG_KEY) */
export const PRESET_ETAG_KEY = 'vws_preset_etag'
/** GM_setValue key: activated preset hash (must match launcherScript.PRESET_ACTIVATED_HASH_KEY) */
export const PRESET_ACTIVATED_HASH_KEY = 'vws_preset_activated_hash'
/** GM_setValue key: rollback hash (must match launcherScript.PRESET_PREVIOUS_HASH_KEY) */
export const PRESET_PREVIOUS_HASH_KEY = 'vws_preset_previous_hash'
/** GM_setValue key: last module-manifest ETag (must match launcherScript.MODULE_MANIFEST_ETAG_KEY) */
export const MODULE_MANIFEST_ETAG_KEY = 'vws_module_manifest_etag'
/** GM_setValue key: cached script-bundle URL (must match launcherScript.SCRIPT_BUNDLE_URL_KEY) */
export const SCRIPT_BUNDLE_URL_KEY = 'vws_script_bundle_url'
/** GM_setValue key: set before reload so we show "Preset updated" after reload (must match launcherScript.PRESET_UPDATED_NOTIFY_KEY) */
export const PRESET_UPDATED_NOTIFY_KEY = 'vws_preset_updated_notify'
/** GM_setValue key: set to trigger launcher reload in all tabs (must match launcherScript.PRESET_UPDATE_CHANNEL_KEY) */
export const PRESET_UPDATE_CHANNEL_KEY = 'vws_preset_update'
/** GM_setValue key: last SSE preset-built message hash, only update when hash changes */
export const PRESET_BUILT_HASH_KEY = 'vws_preset_built_hash'

/** GM_setValue key: when true, launcher + preset may request your deployment (rules, remote script, dev SSE/HMR); default false (offline shell) */
export const SHELL_NETWORK_ENABLED_KEY = 'vws_shell_network_enabled'

/** GM_setValue key: cached tampermonkey-remote.js body for offline shell */
export const REMOTE_SCRIPT_CACHE_KEY = 'vws_remote_script_cache'

/** Reconnect delay (ms) when preset-built SSE connection closes or errors */
export const PRESET_BUILT_SSE_RECONNECT_MS = 2000

/** Poll interval (ms) for preset-built when using GM_xmlhttpRequest (no streaming SSE in Tampermonkey) */
export const PRESET_BUILT_POLL_MS = 3000
