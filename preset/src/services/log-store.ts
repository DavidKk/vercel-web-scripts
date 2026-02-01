/**
 * Log store service
 * In-memory ring buffer (max 1000) + IndexedDB persistence
 * New DB: vercel_web_script_logs
 */

const DB_NAME = 'vercel_web_script_logs'
const DB_VERSION = 1
const STORE_NAME = 'logEntries'
const STORAGE_KEY = 'buffer'
const MAX_LOG_ENTRIES = 1000

export type LogLevel = 'info' | 'warn' | 'fail' | 'ok' | 'debug'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
}

type LogStoreListener = (entries: LogEntry[]) => void

let memoryBuffer: LogEntry[] = []
const listeners: LogStoreListener[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null
let dbInstance: IDBDatabase | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        dbInstance = request.result
        resolve(dbInstance)
      }
      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
    } catch (e) {
      reject(e)
    }
  })
}

function persistToIDB(): void {
  if (typeof indexedDB === 'undefined' || !indexedDB) return
  openDB()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(memoryBuffer.slice(-MAX_LOG_ENTRIES), STORAGE_KEY)
    })
    .catch((e) => {
      // eslint-disable-next-line no-console -- log-store runs before GME logger; expose persistence failure
      console.error('[log-store] persistToIDB failed:', e)
    })
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistToIDB()
  }, 300)
}

function notifyListeners(): void {
  const copy = memoryBuffer.slice()
  listeners.forEach((cb) => cb(copy))
}

/**
 * Push a log entry (ring buffer: keep latest MAX_LOG_ENTRIES)
 */
function pushLog(level: LogLevel, message: string): void {
  const entry: LogEntry = { level, message, timestamp: Date.now() }
  memoryBuffer.push(entry)
  if (memoryBuffer.length > MAX_LOG_ENTRIES) {
    memoryBuffer = memoryBuffer.slice(-MAX_LOG_ENTRIES)
  }
  schedulePersist()
  notifyListeners()
}

/**
 * Get current logs (copy)
 */
function getLogs(): LogEntry[] {
  return memoryBuffer.slice()
}

/**
 * Clear all logs (memory + IndexedDB)
 */
function clearLogs(): void {
  memoryBuffer = []
  notifyListeners()
  if (typeof indexedDB === 'undefined' || !indexedDB) return
  openDB()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(STORAGE_KEY)
    })
    .catch((e) => {
      // eslint-disable-next-line no-console -- log-store runs before GME logger; expose clear failure
      console.error('[log-store] clearLogs failed:', e)
    })
}

/**
 * Subscribe to log updates (e.g. for UI)
 * @returns Unsubscribe function
 */
function subscribe(listener: LogStoreListener): () => void {
  listeners.push(listener)
  return () => {
    const i = listeners.indexOf(listener)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/**
 * Load persisted logs from IndexedDB into memory (call once at startup)
 */
function loadFromIDB(): void {
  if (typeof indexedDB === 'undefined' || !indexedDB) return
  openDB()
    .then((db) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(STORAGE_KEY)
      req.onsuccess = () => {
        const data = req.result
        if (Array.isArray(data) && data.length) {
          memoryBuffer = data.length > MAX_LOG_ENTRIES ? data.slice(-MAX_LOG_ENTRIES) : data
          notifyListeners()
        }
      }
    })
    .catch((e) => {
      // eslint-disable-next-line no-console -- log-store runs before GME logger; expose load failure
      console.error('[log-store] loadFromIDB failed:', e)
    })
}

// Load persisted logs when script runs
if (typeof window !== 'undefined') {
  loadFromIDB()
}

export const logStore = {
  push: pushLog,
  getLogs,
  clearLogs,
  subscribe,
  MAX_LOG_ENTRIES,
}
