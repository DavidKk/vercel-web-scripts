/**
 * Log store configuration.
 * Used to create a LogStore instance (e.g. for different DB names or retention in tests).
 */

export interface LogStoreConfig {
  /** IndexedDB database name */
  dbName: string
  /** IndexedDB schema version */
  dbVersion: number
  /** IndexedDB object store name */
  storeName: string
  /** Key used to store the log buffer in the object store */
  storageKey: string
  /** Max number of log entries kept in memory and persisted */
  maxEntries: number
  /** Logs older than this (days) are removed */
  retentionDays: number
  /** Debounce delay (ms) before persisting to IndexedDB after a push */
  persistDebounceMs: number
}

/** Default configuration for production log store */
export const defaultLogStoreConfig: LogStoreConfig = {
  dbName: 'vercel_web_script_logs',
  dbVersion: 1,
  storeName: 'logEntries',
  storageKey: 'buffer',
  maxEntries: 1000,
  retentionDays: 7,
  persistDebounceMs: 300,
}
