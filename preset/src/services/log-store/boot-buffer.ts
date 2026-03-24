/**
 * Tampermonkey launcher runs before the preset bundle; it cannot use LogStore yet.
 * Launcher pushes structured rows onto `globalThis.__VWS_BOOT_LOG__`; when log-store loads,
 * {@link flushBootLogBufferIntoStore} replays them into the ring buffer with original timestamps.
 */

import type { LogStore } from './LogStore'
import type { LogLevel } from './types'

/** Global key for pre-preset boot log ring buffer (must match launcher userscript). */
export const VWS_BOOT_LOG_GLOBAL_KEY = '__VWS_BOOT_LOG__'

const VALID_LEVELS: ReadonlySet<LogLevel> = new Set(['info', 'warn', 'fail', 'ok', 'debug'])

/**
 * Shape written by the launcher `bootLog` helper (embedded string, kept minimal for ES5).
 */
export interface VwsBootLogRecord {
  t: number
  level: string
  message: string
}

/**
 * Normalize a launcher-provided level string to a store level.
 * @param raw Level from boot buffer
 * @returns Valid {@link LogLevel}
 */
function normalizeBootLevel(raw: string): LogLevel {
  return VALID_LEVELS.has(raw as LogLevel) ? (raw as LogLevel) : 'info'
}

/**
 * Move launcher boot logs from `globalThis` into the log store (preserves timestamps, prefix `[boot]`).
 * Clears the global buffer so a second flush does nothing.
 * @param store Target log store instance
 */
export function flushBootLogBufferIntoStore(store: LogStore): void {
  const root = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null
  if (!root) {
    return
  }
  const raw = (root as unknown as Record<string, unknown>)[VWS_BOOT_LOG_GLOBAL_KEY]
  if (!Array.isArray(raw) || raw.length === 0) {
    return
  }
  try {
    delete (root as unknown as Record<string, unknown>)[VWS_BOOT_LOG_GLOBAL_KEY]
  } catch {
    ;(root as unknown as Record<string, unknown>)[VWS_BOOT_LOG_GLOBAL_KEY] = []
  }
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i] as VwsBootLogRecord
    if (!row || typeof row.message !== 'string') {
      continue
    }
    const level = normalizeBootLevel(typeof row.level === 'string' ? row.level : 'info')
    const t = typeof row.t === 'number' && Number.isFinite(row.t) ? row.t : Date.now()
    store.pushAt(level, `[boot] ${row.message}`, t)
  }
}
