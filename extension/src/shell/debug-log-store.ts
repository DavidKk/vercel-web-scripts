import type { DebugLogAppendInput, DebugLogEntry, DebugLogPortMessage } from '../shared/debug-log-types'
import { DEBUG_LOG_PORT_APPEND, DEBUG_LOG_PORT_SNAPSHOT, MAX_DEBUG_LOG_ENTRIES } from '../shared/debug-log-types'
import { dedupeDebugLogEntriesById, truncateDebugLogMessage } from '../shared/debug-log-utils'

export type DebugLogCollectionGate = () => boolean

type DebugLogListener = (entries: DebugLogEntry[]) => void

/** chrome.storage.session key — survives MV3 service worker restarts within a browser session. */
export const DEBUG_LOG_SESSION_STORAGE_KEY = 'vws_debug_log_session'

/** Legacy split-buffer keys merged into {@link DEBUG_LOG_SESSION_STORAGE_KEY} on hydrate. */
const LEGACY_DEBUG_LOG_SESSION_KEYS = ['vws_debug_log_session_incognito'] as const

type DebugLogSessionPayload = {
  nextId: number
  entries: DebugLogEntry[]
}

type StoreState = {
  nextId: number
  buffer: DebugLogEntry[]
  ports: Set<chrome.runtime.Port>
}

const state: StoreState = {
  nextId: 1,
  buffer: [],
  ports: new Set(),
}

const listeners = new Set<DebugLogListener>()

let collectionGate: DebugLogCollectionGate = () => true
let incognitoCollectionGate: DebugLogCollectionGate = () => false
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
 * Register gate for whether incognito-tab logs are accepted (default off).
 * @param gate Returns true when incognito log collection is enabled
 */
export function setIncognitoLogCollectionGate(gate: DebugLogCollectionGate): void {
  incognitoCollectionGate = gate
}

/**
 * @returns Whether debug log collection is currently enabled
 */
export function isDebugLogCollectionEnabled(): boolean {
  return collectionGate()
}

function shouldAcceptEntry(input: DebugLogAppendInput): boolean {
  if (!collectionGate()) {
    return false
  }
  if (input.meta?.incognito === true && !incognitoCollectionGate()) {
    return false
  }
  return true
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
    const payload: DebugLogSessionPayload = { nextId: state.nextId, entries: state.buffer.slice() }
    void chrome.storage.session.set({ [DEBUG_LOG_SESSION_STORAGE_KEY]: payload }).catch(() => undefined)
  }, 200)
}

function commitEntries(inputs: DebugLogAppendInput[]): DebugLogEntry[] {
  const accepted = inputs.filter((input) => shouldAcceptEntry(input))
  if (accepted.length === 0) {
    return []
  }
  const committed: DebugLogEntry[] = []
  for (const raw of accepted) {
    const input = normalizeAppendInput(raw)
    const entry: DebugLogEntry = {
      ...input,
      id: state.nextId++,
      t: Date.now(),
    }
    state.buffer.push(entry)
    committed.push(entry)
    while (state.buffer.length > MAX_DEBUG_LOG_ENTRIES) {
      state.buffer.shift()
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
  for (const port of state.ports) {
    try {
      port.postMessage(message)
    } catch {
      state.ports.delete(port)
    }
  }
}

function resetBuffer(): void {
  state.buffer.length = 0
  state.nextId = 1
}

function mergeLegacySessionEntries(payloads: Array<DebugLogSessionPayload | undefined>): DebugLogEntry[] {
  const merged: DebugLogEntry[] = []
  for (const payload of payloads) {
    if (!payload || !Array.isArray(payload.entries)) {
      continue
    }
    merged.push(...payload.entries)
  }
  const deduped = dedupeDebugLogEntriesById(merged)
  return deduped.slice(-MAX_DEBUG_LOG_ENTRIES)
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
      const keys = [DEBUG_LOG_SESSION_STORAGE_KEY, ...LEGACY_DEBUG_LOG_SESSION_KEYS]
      const result = await chrome.storage.session.get(keys)
      if (generationAtStart !== installGeneration) {
        return
      }
      const primary = result[DEBUG_LOG_SESSION_STORAGE_KEY] as DebugLogSessionPayload | undefined
      const legacyPayloads = LEGACY_DEBUG_LOG_SESSION_KEYS.map((key) => result[key] as DebugLogSessionPayload | undefined)
      const entries = primary && Array.isArray(primary.entries) ? mergeLegacySessionEntries([primary, ...legacyPayloads]) : mergeLegacySessionEntries(legacyPayloads)
      resetBuffer()
      state.buffer.push(...entries)
      const nextIds = [primary?.nextId, ...legacyPayloads.map((payload) => payload?.nextId)].filter((value): value is number => typeof value === 'number' && value > 0)
      if (nextIds.length > 0) {
        state.nextId = Math.max(...nextIds, ...entries.map((entry) => entry.id + 1), 1)
      } else if (entries.length > 0) {
        state.nextId = Math.max(...entries.map((entry) => entry.id + 1), 1)
      }
      if (legacyPayloads.some(Boolean)) {
        void chrome.storage.session.remove([...LEGACY_DEBUG_LOG_SESSION_KEYS]).catch(() => undefined)
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
  if (entries.length === 0) {
    return []
  }
  return commitEntries(entries)
}

/**
 * @returns Snapshot copy of buffered debug log entries
 */
export function getDebugLogSnapshot(): DebugLogEntry[] {
  return state.buffer.slice()
}

/**
 * Clear session debug logs and notify subscribers.
 */
export function clearDebugLogs(): void {
  installGeneration++
  for (const port of state.ports) {
    try {
      port.postMessage({ type: DEBUG_LOG_PORT_SNAPSHOT, entries: [] } satisfies DebugLogPortMessage)
    } catch {
      state.ports.delete(port)
    }
  }
  resetBuffer()
  hydratePromise = undefined
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = undefined
  }
  if (typeof chrome !== 'undefined' && chrome.storage?.session) {
    void chrome.storage.session.remove([DEBUG_LOG_SESSION_STORAGE_KEY, ...LEGACY_DEBUG_LOG_SESSION_KEYS]).catch(() => undefined)
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
 * @param port Connected port with name `debug-logs`
 */
export function attachDebugLogPort(port: chrome.runtime.Port): void {
  state.ports.add(port)
  try {
    port.postMessage({ type: DEBUG_LOG_PORT_SNAPSHOT, entries: getDebugLogSnapshot() } satisfies DebugLogPortMessage)
  } catch {
    state.ports.delete(port)
    return
  }
  port.onDisconnect.addListener(() => {
    state.ports.delete(port)
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
