/**
 * Log store types: log levels, entry shape, and listener type.
 */

export type LogLevel = 'info' | 'warn' | 'fail' | 'ok' | 'debug'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  /** Optional correlation id for this log line (script run / UI action). */
  traceId?: string
}

export type LogStoreListener = (entries: LogEntry[]) => void

/** Scope for getLogs: current session only (this page open) or all persisted logs */
export type LogScope = 'current' | 'all'
