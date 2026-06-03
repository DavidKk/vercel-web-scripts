/**
 * Log store configuration.
 * Used to create a LogStore instance (e.g. for different DB names or retention in tests).
 */

import { MM_LOG_STORE_DB_NAME, MM_LOG_STORE_DB_VERSION, MM_LOG_STORE_OBJECT_STORE, MM_LOG_STORE_STORAGE_KEY } from '@shared/mm-indexed-db'

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
  /** When false, logs are kept in memory only (current session / tab) */
  persistToIndexedDB: boolean
}

/** Default configuration for production log store */
export const defaultLogStoreConfig: LogStoreConfig = {
  dbName: MM_LOG_STORE_DB_NAME,
  dbVersion: MM_LOG_STORE_DB_VERSION,
  storeName: MM_LOG_STORE_OBJECT_STORE,
  storageKey: MM_LOG_STORE_STORAGE_KEY,
  maxEntries: 1000,
  retentionDays: 7,
  persistDebounceMs: 300,
  persistToIndexedDB: false,
}
