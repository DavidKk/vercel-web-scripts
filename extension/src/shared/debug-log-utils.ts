import { DEBUG_LOG_MESSAGE_MAX_CHARS } from './debug-log-types'

/**
 * Parse hostname from a tab or page URL for debug log meta.
 * @param url Full URL or empty
 * @returns Hostname or undefined when not parseable
 */
export function parseDebugLogHost(url: string | undefined): string | undefined {
  if (!url?.trim()) {
    return undefined
  }
  try {
    const host = new URL(url).hostname
    return host || undefined
  } catch {
    return undefined
  }
}

/**
 * Build debug-log meta from a tab URL and optional tab id.
 * @param url Tab URL
 * @param tabId Chrome tab id when known
 */
export function buildDebugLogMetaFromTab(url: string | undefined, tabId?: number): { tabId?: number; host?: string; url?: string } {
  const host = parseDebugLogHost(url)
  const meta: { tabId?: number; host?: string; url?: string } = {}
  if (typeof tabId === 'number') {
    meta.tabId = tabId
  }
  if (host) {
    meta.host = host
  }
  if (url?.trim()) {
    meta.url = url
  }
  return meta
}

/**
 * Truncate a log message to the configured max length.
 * @param message Raw message text
 */
export function truncateDebugLogMessage(message: string): string {
  if (message.length <= DEBUG_LOG_MESSAGE_MAX_CHARS) {
    return message
  }
  return `${message.slice(0, DEBUG_LOG_MESSAGE_MAX_CHARS - 1)}…`
}

/**
 * Format arbitrary log arguments into a single debug log line.
 * @param args Values to stringify
 */
export function formatDebugLogMessage(...args: unknown[]): string {
  const parts = args.map((arg) => {
    if (typeof arg === 'string') {
      return arg
    }
    if (arg instanceof Error) {
      return arg.stack ?? arg.message
    }
    try {
      return JSON.stringify(arg)
    } catch {
      return String(arg)
    }
  })
  return truncateDebugLogMessage(parts.join(' '))
}
