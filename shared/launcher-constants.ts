/**
 * Launcher storage keys and runtime flags shared by Tampermonkey launcher and Chrome extension shell.
 */

/** GM_setValue key for cached preset script content */
export const PRESET_CACHE_KEY = 'vws_preset_cache'
/** GM_setValue key for preset response ETag (content hash); used for If-None-Match → 304. */
export const PRESET_ETAG_KEY = 'vws_preset_etag'
/** GM_setValue key for preset update push (dev SSE / helper page) */
export const PRESET_UPDATE_CHANNEL_KEY = 'vws_preset_update'
/** Set before reload so preset shows "Preset updated" notification */
export const PRESET_UPDATED_NOTIFY_KEY = 'vws_preset_updated_notify'
/** When not strictly true, launcher skips network for preset */
export const SHELL_NETWORK_ENABLED_KEY = 'vws_shell_network_enabled'
/** Legacy auto-update toggle */
export const LEGACY_AUTO_UPDATE_SCRIPT_KEY = 'vws_auto_update_script'
/** Current activated preset hash */
export const PRESET_ACTIVATED_HASH_KEY = 'vws_preset_activated_hash'
/** Previous activated preset hash for rollback */
export const PRESET_PREVIOUS_HASH_KEY = 'vws_preset_previous_hash'
/** ETag of last successful module-manifest.json response */
export const MODULE_MANIFEST_ETAG_KEY = 'vws_module_manifest_etag'
/** Last known script-bundle URL from manifest */
export const SCRIPT_BUNDLE_URL_KEY = 'vws_script_bundle_url'

/** Prefix for runtime state keys cleared on "Reset Runtime State" */
export const RUNTIME_STATE_KEY_PREFIX = 'vws_'

/** Ring buffer key on globalThis (must match preset log-store) */
export const BOOT_LOG_KEY = '__VWS_BOOT_LOG__'
export const BOOT_LOG_MAX = 200

export const MODULE_LOG_PREFIX = '[ModuleLoad][preset-core]'
