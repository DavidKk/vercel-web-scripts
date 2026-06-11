import type { DebugLogAppendInput, DebugLogEntry, DebugLogPortMessage } from '@ext/shared/debug-log-types'
import { DEBUG_LOG_PORT_APPEND, DEBUG_LOG_PORT_SNAPSHOT, MAX_DEBUG_LOG_ENTRIES } from '@ext/shared/debug-log-types'
import { truncateDebugLogMessage } from '@ext/shared/debug-log-utils'

export type DebugLogCollectionGate = () => boolean

type DebugLogListener = (entries: DebugLogEntry[]) => void

/** chrome.storage.session key — survives MV3 service worker restarts within a browser session. */
export const DEBUG_LOG_SESSION_STORAGE_KEY = 'vws_debug_log_session'

type DebugLogSessionPayload = {
  nextId: number
  entries: DebugLogEntry[]
}

let nextId = 1
const buffer: DebugLogEntry[] = []
const listeners = new Set<DebugLogListener>()
const ports = new Set<chrome.runtime.Port>()

let collectionGate: DebugLogCollectionGate = () => true
let hydratePromise: Promise<void> | undefined
let persistTimer: ReturnType<typeof setTimeout> | undefined
/** Bumped on extension install/reload so in-flight hydration cannot restore stale session data. */
let installGeneration = 0

/**
 * Register synchronous gate for whether new debug logs are accepted.
 * @param gate Returns false when shell log output mode is `none`
 */
export function setDebugLogCollectionGate(gate: DebugLogCollectionGate): void {
  collectionGate = gate
}

/**
 * @returns Whether debug log collection is currently enabled
 */
export function isDebugLogCollectionEnabled(): boolean {
  return collectionGate()
}

function normalizeAppendInput(input: DebugLogAppendInput): DebugLogAppendInput {
  return {
    ...input,
    scope: input.scope.trim() || 'Unknown',
    message: truncateDebugLogMessage(input.message),
  }
}

function schedulePersistToSession(): void {
  if (typeof chrome === 'undefined' || !chrome.storage?.session) {
    return
  }
  if (persistTimer) {
    clearTimeout(persistTimer)
  }
  persistTimer = setTimeout(() => {
    persistTimer = undefined
    const payload: DebugLogSessionPayload = { nextId, entries: buffer.slice() }
    void chrome.storage.session.set({ [DEBUG_LOG_SESSION_STORAGE_KEY]: payload }).catch(() => undefined)
  }, 200)
}

function commitEntries(inputs: DebugLogAppendInput[]): DebugLogEntry[] {
  if (inputs.length === 0 || !collectionGate()) {
    return []
  }
  const committed: DebugLogEntry[] = []
  for (const raw of inputs) {
    const input = normalizeAppendInput(raw)
    const entry: DebugLogEntry = {
      ...input,
      id: nextId++,
      t: Date.now(),
    }
    buffer.push(entry)
    committed.push(entry)
    while (buffer.length > MAX_DEBUG_LOG_ENTRIES) {
      buffer.shift()
    }
  }
  if (committed.length === 0) {
    return []
  }
  schedulePersistToSession()
  for (const listener of listeners) {
    listener(committed)
  }
  broadcastPortAppend(committed)
  return committed
}

function broadcastPortAppend(entries: DebugLogEntry[]): void {
  if (entries.length === 0) {
    return
  }
  const message: DebugLogPortMessage = { type: DEBUG_LOG_PORT_APPEND, entries }
  for (const port of ports) {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }
}

/**
 * Restore in-memory buffer from chrome.storage.session (browser session only).
 */
export async function initDebugLogStore(): Promise<void> {
  if (hydratePromise) {
    return hydratePromise
  }
  const generationAtStart = installGeneration
  hydratePromise = (async (): Promise<void> => {
    if (typeof chrome === 'undefined' || !chrome.storage?.session) {
      return
    }
    try {
      const result = await chrome.storage.session.get(DEBUG_LOG_SESSION_STORAGE_KEY)
      if (generationAtStart !== installGeneration) {
        return
      }
      const payload = result[DEBUG_LOG_SESSION_STORAGE_KEY] as DebugLogSessionPayload | undefined
      if (!payload || !Array.isArray(payload.entries)) {
        return
      }
      buffer.length = 0
      buffer.push(...payload.entries.slice(-MAX_DEBUG_LOG_ENTRIES))
      if (typeof payload.nextId === 'number' && payload.nextId > 0) {
        nextId = payload.nextId
      }
    } catch {
      // ignore hydration errors
    }
  })()
  return hydratePromise
}

/**
 * Append one or more debug log entries to the session ring buffer in background.
 * Collection is independent of the admin Logs tab — the tab only reads this store.
 * @param input Single entry or batch
 */
export function appendDebugLog(input: DebugLogAppendInput | DebugLogAppendInput[]): DebugLogEntry[] {
  const entries = Array.isArray(input) ? input : [input]
  if (entries.length === 0 || !collectionGate()) {
    return []
  }
  return commitEntries(entries)
}

/**
 * @returns Snapshot copy of all buffered debug log entries
 */
export function getDebugLogSnapshot(): DebugLogEntry[] {
  return buffer.slice()
}

/** Clear all session debug logs and notify subscribers. */
export function clearDebugLogs(): void {
  installGeneration++
  buffer.length = 0
  nextId = 1
  hydratePromise = undefined
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = undefined
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    void chrome.storage.session.remove(DEBUG_LOG_SESSION_STORAGE_KEY).catch(() => undefined)
  }
  for (const port of ports) {
    try {
      port.postMessage({ type: DEBUG_LOG_PORT_SNAPSHOT, entries: [] } satisfies DebugLogPortMessage)
    } catch {
      ports.delete(port)
    }
  }
}

/**
 * Subscribe to committed debug log batches (in-process listeners).
 * @param listener Called with each committed batch
 */
export function subscribeDebugLogs(listener: DebugLogListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Wire chrome.runtime.connect port for admin logs panel live updates.
 * @param port Connected port with name {@link DEBUG_LOG_PORT_NAME}
 */
export function attachDebugLogPort(port: chrome.runtime.Port): void {
  ports.add(port)
  try {
    port.postMessage({ type: DEBUG_LOG_PORT_SNAPSHOT, entries: getDebugLogSnapshot() } satisfies DebugLogPortMessage)
  } catch {
    ports.delete(port)
    return
  }
  port.onDisconnect.addListener(() => {
    ports.delete(port)
  })
}

/**
 * Normalize APPEND_DEBUG_LOG message details to an array of inputs.
 * @param details Message payload
 */
export function normalizeDebugLogAppendDetails(details: DebugLogAppendInput | { entries: DebugLogAppendInput[] }): DebugLogAppendInput[] {
  if ('entries' in details && Array.isArray(details.entries)) {
    return details.entries
  }
  return [details as DebugLogAppendInput]
}
