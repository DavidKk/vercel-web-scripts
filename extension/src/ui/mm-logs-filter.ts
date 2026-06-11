import type { DebugLogEntry, DebugLogLevel } from '@ext/shared/debug-log-types'

/** Default level chips: all except debug. */
export const DEFAULT_DEBUG_LOG_LEVEL_FILTER: readonly DebugLogLevel[] = ['info', 'ok', 'warn', 'error']

export type DebugLogsFilterCriteria = {
  levelFilter: ReadonlySet<DebugLogLevel>
  sourceFilter: string
  scopeFilter: string
  hostFilter: string
  tabFilter: string
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
  const { levelFilter, sourceFilter, scopeFilter, hostFilter, tabFilter, search } = criteria
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
    if (search) {
      const tabIdPart = entry.meta?.tabId != null ? String(entry.meta.tabId) : ''
      const haystack = `${entry.scope} ${entry.message} ${entry.source} ${entry.meta?.url ?? ''} ${entry.meta?.host ?? ''} ${tabIdPart}`.toLowerCase()
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
  if (criteria.sourceFilter || criteria.scopeFilter || criteria.hostFilter || criteria.tabFilter) {
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
export function formatDebugLogsFooterText(params: { filteredCount: number; totalCount: number; maxEntries: number; logMode: string }): string {
  const { filteredCount, totalCount, maxEntries, logMode } = params
  const base = `${totalCount} / ${maxEntries} entries · Session only · Log mode: ${logMode}`
  if (filteredCount === totalCount) {
    return base
  }
  return `${filteredCount} shown · ${base}`
}
