/**
 * Log store types: log levels, entry shape, and listener type.
 */

export type LogLevel = 'info' | 'warn' | 'fail' | 'ok' | 'debug'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
}

export type LogStoreListener = (entries: LogEntry[]) => void
