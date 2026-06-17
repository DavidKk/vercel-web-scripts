import type { DebugLogEntry, DebugLogLevel } from '../../shared/debug-log-types'
import { isIncognitoDebugLogEntry } from '../../shared/debug-log-utils'

/** Default level chips: all except debug. */
export const DEFAULT_DEBUG_LOG_LEVEL_FILTER: readonly DebugLogLevel[] = ['info', 'ok', 'warn', 'error']

export type DebugLogsIncognitoFilter = '' | 'normal' | 'incognito'

export type DebugLogsFilterCriteria = {
  levelFilter: ReadonlySet<DebugLogLevel>
  sourceFilter: string
  scopeFilter: string
  hostFilter: string
  tabFilter: string
  incognitoFilter: DebugLogsIncognitoFilter
  search: string
}

/**
 * @returns Whether at least one level chip must stay selected
 */
export function canDeselectDebugLogLevel(levelFilter: ReadonlySet<DebugLogLevel>, level: DebugLogLevel): boolean {
  return !(levelFilter.size === 1 && levelFilter.has(level))
}

/**
 * @returns Filtered debug log entries for the admin logs panel
 */
export function filterDebugLogEntries(entries: DebugLogEntry[], criteria: DebugLogsFilterCriteria): DebugLogEntry[] {
  const { levelFilter, sourceFilter, scopeFilter, hostFilter, tabFilter, incognitoFilter, search } = criteria
  return entries.filter((entry) => {
    if (!levelFilter.has(entry.level)) {
      return false
    }
    if (sourceFilter && entry.source !== sourceFilter) {
      return false
    }
    if (scopeFilter && entry.scope.trim() !== scopeFilter) {
      return false
    }
    if (hostFilter && (entry.meta?.host?.trim() ?? '') !== hostFilter) {
      return false
    }
    if (tabFilter) {
      if (entry.meta?.tabId == null || String(entry.meta.tabId) !== tabFilter) {
        return false
      }
    }
    if (incognitoFilter === 'incognito' && !isIncognitoDebugLogEntry(entry)) {
      return false
    }
    if (incognitoFilter === 'normal' && isIncognitoDebugLogEntry(entry)) {
      return false
    }
    if (search) {
      const tabIdPart = entry.meta?.tabId != null ? String(entry.meta.tabId) : ''
      const incognitoPart = isIncognitoDebugLogEntry(entry) ? 'incognito private' : ''
      const haystack = `${entry.scope} ${entry.message} ${entry.source} ${entry.meta?.url ?? ''} ${entry.meta?.host ?? ''} ${tabIdPart} ${incognitoPart}`.toLowerCase()
      if (!haystack.includes(search)) {
        return false
      }
    }
    return true
  })
}

/**
 * @returns Whether any filter differs from the default cleared state
 */
export function hasActiveDebugLogFilters(criteria: DebugLogsFilterCriteria): boolean {
  if (criteria.search) {
    return true
  }
  if (criteria.sourceFilter || criteria.scopeFilter || criteria.hostFilter || criteria.tabFilter || criteria.incognitoFilter) {
    return true
  }
  const defaultSet = new Set(DEFAULT_DEBUG_LOG_LEVEL_FILTER)
  if (criteria.levelFilter.size !== defaultSet.size) {
    return true
  }
  for (const level of DEFAULT_DEBUG_LOG_LEVEL_FILTER) {
    if (!criteria.levelFilter.has(level)) {
      return true
    }
  }
  for (const level of criteria.levelFilter) {
    if (!defaultSet.has(level)) {
      return true
    }
  }
  return false
}

/**
 * @returns Empty-state copy for the logs list
 */
export function getDebugLogsEmptyMessage(totalEntries: number): string {
  if (totalEntries === 0) {
    return 'No debug logs in this session yet.'
  }
  return 'No log entries match the current filters.'
}

/**
 * @returns Footer status line for the logs panel
 */
export function formatDebugLogsFooterText(params: { filteredCount: number; totalCount: number; maxEntries: number; logMode: string; incognitoCollection?: boolean }): string {
  const { filteredCount, totalCount, maxEntries, logMode, incognitoCollection } = params
  const incognitoNote = incognitoCollection ? '' : ' · Incognito logs off'
  const base = `${totalCount} / ${maxEntries} entries · Session only · Log mode: ${logMode}${incognitoNote}`
  if (filteredCount === totalCount) {
    return base
  }
  return `${filteredCount} shown · ${base}`
}

/** Tab-separated clipboard export columns. */
export const DEBUG_LOG_CLIPBOARD_COLUMNS = ['Time', 'Level', 'Source', 'Scope', 'Host', 'Tab', 'Incognito', 'Message'] as const

/**
 * Escape a field for TSV export (quote when it contains tabs, quotes, or newlines).
 */
export function escapeTsvField(value: string): string {
  if (!/[\t\r\n"]/.test(value)) {
    return value
  }
  return `"${value.replace(/"/g, '""')}"`
}

/**
 * @returns Full timestamp for clipboard export (YYYY-MM-DD HH:mm:ss.SSS)
 */
export function formatDebugLogTimeForClipboard(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`
}

/**
 * @returns One TSV row for a debug log entry
 */
export function formatDebugLogEntryForClipboard(entry: DebugLogEntry): string {
  const host = entry.meta?.host?.trim() ?? ''
  const tab = entry.meta?.tabId != null ? String(entry.meta.tabId) : ''
  const incognito = entry.meta?.incognito === true ? 'yes' : ''
  const fields = [formatDebugLogTimeForClipboard(entry.t), entry.level, entry.source, entry.scope.trim(), host, tab, incognito, entry.message]
  return fields.map(escapeTsvField).join('\t')
}

/**
 * @returns TSV text for clipboard export (header + rows)
 */
export function formatDebugLogsForClipboard(entries: DebugLogEntry[]): string {
  const header = DEBUG_LOG_CLIPBOARD_COLUMNS.join('\t')
  if (entries.length === 0) {
    return header
  }
  return [header, ...entries.map(formatDebugLogEntryForClipboard)].join('\n')
}
