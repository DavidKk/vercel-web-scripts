/**
 * MagickMonkey IndexedDB identifiers (mm_* prefix).
 * Bump dbVersion when renaming databases or object stores (creates a fresh schema).
 */

/** Log viewer / log-store persistence */
export const MM_LOG_STORE_DB_NAME = 'mm_logs'
export const MM_LOG_STORE_DB_VERSION = 2
export const MM_LOG_STORE_OBJECT_STORE = 'mm_log_entries'
export const MM_LOG_STORE_STORAGE_KEY = 'buffer'

/** Web script editor (files, tabs, layout) */
export const MM_SCRIPT_EDITOR_DB_NAME = 'mm_script_editor'
/** Previous name: script_editor_storage (v5). Renamed DB requires version bump. */
export const MM_SCRIPT_EDITOR_DB_VERSION = 6
