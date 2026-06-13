import { DEBUG_LOG_MESSAGE_MAX_CHARS, type DebugLogEntry, type DebugLogMeta } from './debug-log-types'

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
 * @param incognito Whether the tab is incognito when known
 */
export function buildDebugLogMetaFromTab(url: string | undefined, tabId?: number, incognito?: boolean): DebugLogMeta {
  const host = parseDebugLogHost(url)
  const meta: DebugLogMeta = {}
  if (typeof tabId === 'number') {
    meta.tabId = tabId
  }
  if (host) {
    meta.host = host
  }
  if (url?.trim()) {
    meta.url = url
  }
  if (typeof incognito === 'boolean') {
    meta.incognito = incognito
  }
  return meta
}

/**
 * @returns Whether the current extension page (admin/popup) runs in an incognito context
 */
export function isDebugLogViewerIncognito(): boolean {
  try {
    return typeof chrome !== 'undefined' && chrome.extension?.inIncognitoContext === true
  } catch {
    return false
  }
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

/**
 * @returns Whether a debug log entry originated from an incognito tab or extension context
 */
export function isIncognitoDebugLogEntry(entry: { meta?: DebugLogMeta }): boolean {
  return entry.meta?.incognito === true
}

/**
 * Keep the first entry per id (earlier payloads win during legacy buffer merge).
 */
export function dedupeDebugLogEntriesById(entries: DebugLogEntry[]): DebugLogEntry[] {
  const seen = new Set<number>()
  const deduped: DebugLogEntry[] = []
  for (const entry of entries) {
    if (typeof entry.id !== 'number' || seen.has(entry.id)) {
      continue
    }
    seen.add(entry.id)
    deduped.push(entry)
  }
  return deduped.sort((a, b) => a.id - b.id || a.t - b.t)
}
