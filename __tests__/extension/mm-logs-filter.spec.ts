import type { DebugLogEntry } from '../../extension/src/shared/debug-log-types'
import {
  canDeselectDebugLogLevel,
  DEFAULT_DEBUG_LOG_LEVEL_FILTER,
  filterDebugLogEntries,
  formatDebugLogsFooterText,
  getDebugLogsEmptyMessage,
  hasActiveDebugLogFilters,
} from '../../extension/src/ui/mm-logs-filter'

function entry(partial: Partial<DebugLogEntry> & Pick<DebugLogEntry, 'id' | 'level' | 'source' | 'scope' | 'message'>): DebugLogEntry {
  return {
    t: 1,
    ...partial,
  }
}

describe('mm-logs-filter', () => {
  const sample: DebugLogEntry[] = [
    entry({ id: 1, level: 'info', source: 'background', scope: 'Shell', message: 'started' }),
    entry({
      id: 2,
      level: 'warn',
      source: 'page',
      scope: 'Preset',
      message: 'slow load',
      meta: { host: 'shop.example.com', tabId: 42, url: 'https://shop.example.com/' },
    }),
    entry({ id: 3, level: 'debug', source: 'inject', scope: 'Boot', message: 'trace line' }),
  ]

  it('should filter by level source scope host tab and search', () => {
    const criteria = {
      levelFilter: new Set(['warn'] as const),
      sourceFilter: 'page',
      scopeFilter: 'Preset',
      hostFilter: 'shop.example.com',
      tabFilter: '42',
      search: 'slow',
    }
    expect(filterDebugLogEntries(sample, criteria)).toEqual([sample[1]])
  })

  it('should match search against host and tab id', () => {
    expect(
      filterDebugLogEntries(sample, {
        levelFilter: new Set(DEFAULT_DEBUG_LOG_LEVEL_FILTER),
        sourceFilter: '',
        scopeFilter: '',
        hostFilter: '',
        tabFilter: '',
        search: 'shop.example.com',
      })
    ).toEqual([sample[1]])

    expect(
      filterDebugLogEntries(sample, {
        levelFilter: new Set(DEFAULT_DEBUG_LOG_LEVEL_FILTER),
        sourceFilter: '',
        scopeFilter: '',
        hostFilter: '',
        tabFilter: '',
        search: '42',
      })
    ).toEqual([sample[1]])
  })

  it('should trim scope and host when filtering', () => {
    const rows = [entry({ id: 4, level: 'info', source: 'admin', scope: '  Panel  ', message: 'x', meta: { host: '  admin.local  ' } })]
    expect(
      filterDebugLogEntries(rows, {
        levelFilter: new Set(['info'] as const),
        sourceFilter: '',
        scopeFilter: 'Panel',
        hostFilter: 'admin.local',
        tabFilter: '',
        search: '',
      })
    ).toEqual(rows)
  })

  it('should prevent deselecting the last level chip', () => {
    const onlyInfo = new Set(['info'] as const)
    expect(canDeselectDebugLogLevel(onlyInfo, 'info')).toBe(false)
    expect(canDeselectDebugLogLevel(new Set(['info', 'warn'] as const), 'info')).toBe(true)
  })

  it('should detect active filters and empty messages', () => {
    const defaultCriteria = {
      levelFilter: new Set(DEFAULT_DEBUG_LOG_LEVEL_FILTER),
      sourceFilter: '',
      scopeFilter: '',
      hostFilter: '',
      tabFilter: '',
      search: '',
    }
    expect(hasActiveDebugLogFilters(defaultCriteria)).toBe(false)
    expect(hasActiveDebugLogFilters({ ...defaultCriteria, search: 'x' })).toBe(true)
    expect(getDebugLogsEmptyMessage(0)).toBe('No debug logs in this session yet.')
    expect(getDebugLogsEmptyMessage(3)).toBe('No log entries match the current filters.')
  })

  it('should format footer with filtered count when needed', () => {
    expect(
      formatDebugLogsFooterText({
        filteredCount: 2,
        totalCount: 10,
        maxEntries: 1000,
        logMode: 'console',
      })
    ).toBe('2 shown · 10 / 1000 entries · Session only · Log mode: console')

    expect(
      formatDebugLogsFooterText({
        filteredCount: 10,
        totalCount: 10,
        maxEntries: 1000,
        logMode: 'console',
      })
    ).toBe('10 / 1000 entries · Session only · Log mode: console')
  })
})
