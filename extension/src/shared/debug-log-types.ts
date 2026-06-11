/** Max in-memory debug log entries in background (session-only ring buffer). */
export const MAX_DEBUG_LOG_ENTRIES = 1000

/** Max characters per log message before truncation. */
export const DEBUG_LOG_MESSAGE_MAX_CHARS = 8192

/** chrome.runtime.connect port name for admin logs panel subscriptions. */
export const DEBUG_LOG_PORT_NAME = 'debug-logs'

/** Port → admin: full buffer on connect. */
export const DEBUG_LOG_PORT_SNAPSHOT = 'DEBUG_LOG_SNAPSHOT'

/** Port → admin: incremental append batch. */
export const DEBUG_LOG_PORT_APPEND = 'DEBUG_LOG_APPEND'

export type DebugLogSource = 'background' | 'popup' | 'admin' | 'content' | 'inject' | 'page'

export type DebugLogLevel = 'debug' | 'info' | 'ok' | 'warn' | 'error'

export type DebugLogMeta = {
  tabId?: number
  host?: string
  url?: string
  scriptKey?: string
  file?: string
}

/** Input before background assigns `id` and `t`. */
export type DebugLogAppendInput = {
  level: DebugLogLevel
  source: DebugLogSource
  scope: string
  message: string
  meta?: DebugLogMeta
}

export type DebugLogEntry = DebugLogAppendInput & {
  id: number
  t: number
}

export type DebugLogPortMessage = { type: typeof DEBUG_LOG_PORT_SNAPSHOT; entries: DebugLogEntry[] } | { type: typeof DEBUG_LOG_PORT_APPEND; entries: DebugLogEntry[] }
