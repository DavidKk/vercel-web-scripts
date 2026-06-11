import type { DebugLogAppendInput, DebugLogSource } from '@ext/shared/debug-log-types'
import { formatDebugLogMessage } from '@ext/shared/debug-log-utils'
import { reportDebugLog } from '@ext/shared/report-debug-log'
import { shouldExtensionCollectDebugLogs, shouldExtensionLogToConsole } from '@ext/shared/shell-log-output-cache'
import { buildVwsConsoleLogArgs, type VwsConsoleLogLevel } from '@shared/vws-console-log-styles'

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

  /**
   * @param scope Short scope label shown in log prefix, e.g. "Launcher" or "GM"
   */
  constructor(scope: string) {
    this.scope = scope
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
    if (shouldExtensionLogToConsole()) {
      LEVEL_SINK[level](...buildVwsConsoleLogArgs(this.scope, level as VwsConsoleLogLevel, ...args))
    }
    if (!shouldExtensionCollectDebugLogs()) {
      return
    }
    const input: DebugLogAppendInput = {
      source: inferExtensionLogSource(),
      scope: this.scope,
      level,
      message: formatDebugLogMessage(...args),
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

/** Launcher / OTA bootstrap logs */
export const launcherLogger = createExtensionLogger('Launcher')

/** GM API bridge logs */
export const gmLogger = createExtensionLogger('GM')

/** Extension shell / bootstrap logs */
export const extensionLogger = createExtensionLogger('Extension')
