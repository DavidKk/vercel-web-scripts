import type { DebugLogAppendInput, DebugLogSource } from '@ext/shared/debug-log-types'
import { formatDebugLogMessage } from '@ext/shared/debug-log-utils'
import { reportDebugLog } from '@ext/shared/report-debug-log'
import { shouldExtensionCollectDebugLogs, shouldExtensionLogToConsole } from '@ext/shared/shell-log-output-cache'
import { enterTraceScope, exitTraceScope, normalizeTraceId, resolveLogTraceId, shortTraceId } from '@shared/trace-id'
import { buildVwsConsoleLogArgsWithTrace, type VwsConsoleLogLevel } from '@shared/vws-console-log-styles'

export type ExtensionLogLevel = 'debug' | 'info' | 'ok' | 'warn' | 'error'

type ConsoleSink = (...args: unknown[]) => void

const LEVEL_SINK: Record<ExtensionLogLevel, ConsoleSink> = {
  debug: (...args) => {
    // eslint-disable-next-line no-console -- centralized extension log sink
    console.debug(...args)
  },
  info: (...args) => {
    // eslint-disable-next-line no-console -- centralized extension log sink
    console.info(...args)
  },
  ok: (...args) => {
    // eslint-disable-next-line no-console -- centralized extension log sink
    console.log(...args)
  },
  warn: (...args) => {
    // eslint-disable-next-line no-console -- centralized extension log sink
    console.warn(...args)
  },
  error: (...args) => {
    // eslint-disable-next-line no-console -- centralized extension log sink
    console.error(...args)
  },
}

/**
 * Infer debug log source from the current execution context.
 */
export function inferExtensionLogSource(): DebugLogSource {
  if (typeof window === 'undefined') {
    return 'background'
  }
  if (window.location.protocol === 'chrome-extension:') {
    return window.location.pathname.includes('popup') ? 'popup' : 'admin'
  }
  if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return 'content'
  }
  return 'inject'
}

/**
 * Scoped logger for MagickMonkey Chrome extension runtime (content, page, shell).
 */
export class ExtensionLogger {
  private readonly scope: string
  private readonly boundTraceId: string | undefined

  /**
   * @param scope Short scope label shown in log prefix, e.g. "Launcher" or "GM"
   * @param boundTraceId Optional TraceId pinned for concurrent-safe logging
   */
  constructor(scope: string, boundTraceId?: string) {
    this.scope = scope
    this.boundTraceId = normalizeTraceId(boundTraceId)
  }

  /**
   * Return a logger that always attaches the given TraceId (safe across concurrent awaits).
   * Prefer this in background message handlers over {@link withExtensionTraceScopeAsync}.
   * @param traceId TraceId to bind
   * @returns Logger instance with the same scope
   */
  withTrace(traceId: string): ExtensionLogger {
    return new ExtensionLogger(this.scope, traceId)
  }

  /**
   * Write a debug-level log line
   * @param args Values to log
   */
  debug(...args: unknown[]): void {
    this.emit('debug', args)
  }

  /**
   * Write an info-level log line
   * @param args Values to log
   */
  info(...args: unknown[]): void {
    this.emit('info', args)
  }

  /**
   * Write a success / OK log line (maps to console.log)
   * @param args Values to log
   */
  ok(...args: unknown[]): void {
    this.emit('ok', args)
  }

  /**
   * Write a warning log line
   * @param args Values to log
   */
  warn(...args: unknown[]): void {
    this.emit('warn', args)
  }

  /**
   * Write an error log line
   * @param args Values to log
   */
  error(...args: unknown[]): void {
    this.emit('error', args)
  }

  private emit(level: ExtensionLogLevel, args: unknown[]): void {
    const traceId = this.boundTraceId ?? resolveLogTraceId()
    const short = shortTraceId(traceId) || undefined
    if (shouldExtensionLogToConsole()) {
      LEVEL_SINK[level](...buildVwsConsoleLogArgsWithTrace(this.scope, level as VwsConsoleLogLevel, short, ...args))
    }
    if (!shouldExtensionCollectDebugLogs()) {
      return
    }
    const input: DebugLogAppendInput = {
      source: inferExtensionLogSource(),
      scope: this.scope,
      level,
      message: formatDebugLogMessage(...args),
      meta: traceId ? { traceId } : undefined,
    }
    reportDebugLog(input)
  }
}

/**
 * Create a scoped extension logger
 * @param scope Short scope label shown in log prefix
 * @returns Configured logger instance
 */
export function createExtensionLogger(scope: string): ExtensionLogger {
  return new ExtensionLogger(scope)
}

/**
 * Run sync work under a TraceId scope.
 * Do not use across concurrent awaits in the service worker — prefer {@link ExtensionLogger.withTrace}.
 * @param fn Work to run
 * @param traceId Optional existing TraceId
 * @returns Result of `fn`
 */
export function withExtensionTraceScope<T>(fn: () => T, traceId?: string): T {
  enterTraceScope(traceId)
  try {
    return fn()
  } finally {
    exitTraceScope()
  }
}

/**
 * Async TraceId scope helper for single-flight UI paths.
 * Unsafe when multiple background messages interleave at await points — use {@link ExtensionLogger.withTrace}.
 * @param fn Async work to run
 * @param traceId Optional existing TraceId
 * @returns Result of `fn`
 */
export async function withExtensionTraceScopeAsync<T>(fn: () => Promise<T>, traceId?: string): Promise<T> {
  enterTraceScope(traceId)
  try {
    return await fn()
  } finally {
    exitTraceScope()
  }
}

/** Launcher / OTA bootstrap logs */
export const launcherLogger = createExtensionLogger('Launcher')

/** GM API bridge logs */
export const gmLogger = createExtensionLogger('GM')

/** Script permission gate / modal logs */
export const permissionLogger = createExtensionLogger('Permission')

/** Extension shell / bootstrap logs */
export const extensionLogger = createExtensionLogger('Extension')
