/**
 * Log store service class.
 * In-memory ring buffer + IndexedDB persistence; logs older than retention days are dropped.
 */

import type { LogStoreConfig } from './config'
import type { LogEntry, LogLevel, LogScope, LogStoreListener } from './types'

export class LogStore {
  private readonly config: LogStoreConfig
  private readonly retentionMs: number
  /** Timestamp (ms) when this store was created; logs after this are "current session" */
  private readonly sessionStartMs: number
  private memoryBuffer: LogEntry[] = []
  private readonly listeners: LogStoreListener[] = []
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private dbInstance: IDBDatabase | null = null

  constructor(config: LogStoreConfig) {
    this.config = { ...config }
    this.retentionMs = config.retentionDays * 24 * 60 * 60 * 1000
    this.sessionStartMs = Date.now()
  }

  /**
   * Filter entries to those within the retention window.
   * @param entries Log entries to filter
   * @param now Current time (ms), defaults to Date.now()
   * @returns Entries with timestamp >= now - retentionMs
   */
  private filterWithinRetention(entries: LogEntry[], now = Date.now()): LogEntry[] {
    const cutoff = now - this.retentionMs
    return entries.filter((e) => e.timestamp >= cutoff)
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.dbInstance) return Promise.resolve(this.dbInstance)
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.config.dbName, this.config.dbVersion)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          this.dbInstance = request.result
          resolve(this.dbInstance)
        }
        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains(this.config.storeName)) {
            db.createObjectStore(this.config.storeName)
          }
        }
      } catch (e) {
        reject(e)
      }
    })
  }

  private persistToIDB(): void {
    if (typeof indexedDB === 'undefined' || !indexedDB) return
    const toPersist = this.filterWithinRetention(this.memoryBuffer).slice(-this.config.maxEntries)
    this.openDB()
      .then((db) => {
        const tx = db.transaction(this.config.storeName, 'readwrite')
        const store = tx.objectStore(this.config.storeName)
        store.put(toPersist, this.config.storageKey)
      })
      .catch((e) => {
        // eslint-disable-next-line no-console -- log-store runs before GME logger; expose persistence failure
        console.error('[log-store] persistToIDB failed:', e)
      })
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistToIDB()
    }, this.config.persistDebounceMs)
  }

  private notifyListeners(): void {
    const copy = this.memoryBuffer.slice()
    this.listeners.forEach((cb) => cb(copy))
  }

  /**
   * Push a log entry (ring buffer: keep latest maxEntries, drop entries older than retentionDays).
   * @param level Log level
   * @param message Log message
   */
  push(level: LogLevel, message: string): void {
    const entry: LogEntry = { level, message, timestamp: Date.now() }
    this.memoryBuffer.push(entry)
    this.memoryBuffer = this.filterWithinRetention(this.memoryBuffer).slice(-this.config.maxEntries)
    this.schedulePersist()
    this.notifyListeners()
  }

  /**
   * Get logs (copy, within retention window). Optionally limit to current session only.
   * @param scope 'current' = only logs since this page open, 'all' = all persisted logs
   * @returns Copy of log entries
   */
  getLogs(scope: LogScope = 'all'): LogEntry[] {
    const base = this.filterWithinRetention(this.memoryBuffer).slice()
    if (scope === 'current') {
      return base.filter((e) => e.timestamp >= this.sessionStartMs)
    }
    return base
  }

  /**
   * Clear all logs (memory + IndexedDB).
   */
  clearLogs(): void {
    this.memoryBuffer = []
    this.notifyListeners()
    if (typeof indexedDB === 'undefined' || !indexedDB) return
    this.openDB()
      .then((db) => {
        const tx = db.transaction(this.config.storeName, 'readwrite')
        const store = tx.objectStore(this.config.storeName)
        store.delete(this.config.storageKey)
      })
      .catch((e) => {
        // eslint-disable-next-line no-console -- log-store runs before GME logger; expose clear failure
        console.error('[log-store] clearLogs failed:', e)
      })
  }

  /**
   * Subscribe to log updates (e.g. for UI).
   * @param listener Callback invoked with current entries on each update
   * @returns Unsubscribe function
   */
  subscribe(listener: LogStoreListener): () => void {
    this.listeners.push(listener)
    return () => {
      const i = this.listeners.indexOf(listener)
      if (i >= 0) this.listeners.splice(i, 1)
    }
  }

  /** Max number of log entries (from config). */
  get MAX_LOG_ENTRIES(): number {
    return this.config.maxEntries
  }

  /** Log retention in days (from config). */
  get LOG_RETENTION_DAYS(): number {
    return this.config.retentionDays
  }

  /**
   * Load persisted logs from IndexedDB into memory (call once at startup).
   * Merges with any in-memory logs already pushed this session so current-session logs are never lost.
   * Drops entries older than retentionDays and persists pruned buffer if needed.
   */
  loadFromIDB(): void {
    if (typeof indexedDB === 'undefined' || !indexedDB) return
    const currentSessionLogs = this.memoryBuffer.filter((e) => e.timestamp >= this.sessionStartMs)
    this.openDB()
      .then((db) => {
        const tx = db.transaction(this.config.storeName, 'readonly')
        const store = tx.objectStore(this.config.storeName)
        const req = store.get(this.config.storageKey)
        req.onsuccess = () => {
          const data = req.result
          const persisted = Array.isArray(data) ? this.filterWithinRetention(data) : []
          const merged = [...persisted, ...currentSessionLogs].sort((a, b) => a.timestamp - b.timestamp)
          this.memoryBuffer = this.filterWithinRetention(merged).slice(-this.config.maxEntries)
          if (persisted.length > 0 || currentSessionLogs.length > 0) {
            this.schedulePersist()
          }
          this.notifyListeners()
        }
      })
      .catch((e) => {
        // eslint-disable-next-line no-console -- log-store runs before GME logger; expose load failure
        console.error('[log-store] loadFromIDB failed:', e)
      })
  }
}
