import { DEBUG_LOG_MESSAGE_MAX_CHARS } from '@ext/shared/debug-log-types'
import { buildDebugLogMetaFromTab, dedupeDebugLogEntriesById, isIncognitoDebugLogEntry, parseDebugLogHost, truncateDebugLogMessage } from '@ext/shared/debug-log-utils'

describe('debug-log-utils', () => {
  it('should parse host from http urls', () => {
    expect(parseDebugLogHost('https://shop.example.com/path')).toBe('shop.example.com')
    expect(parseDebugLogHost('')).toBeUndefined()
    expect(parseDebugLogHost('not-a-url')).toBeUndefined()
  })

  it('should truncate long messages', () => {
    const long = 'x'.repeat(DEBUG_LOG_MESSAGE_MAX_CHARS + 10)
    const truncated = truncateDebugLogMessage(long)
    expect(truncated.length).toBe(DEBUG_LOG_MESSAGE_MAX_CHARS)
    expect(truncated.endsWith('…')).toBe(true)
  })

  it('should include incognito in tab meta when provided', () => {
    expect(buildDebugLogMetaFromTab('https://shop.example.com/', 7, true)).toEqual({
      tabId: 7,
      host: 'shop.example.com',
      url: 'https://shop.example.com/',
      incognito: true,
    })
  })

  it('should detect incognito debug log entries from meta', () => {
    expect(isIncognitoDebugLogEntry({ meta: { incognito: true } })).toBe(true)
    expect(isIncognitoDebugLogEntry({ meta: { incognito: false } })).toBe(false)
    expect(isIncognitoDebugLogEntry({})).toBe(false)
  })

  it('should dedupe debug log entries by id keeping the first occurrence', () => {
    const primary = { id: 1, t: 1, source: 'background' as const, scope: 'Shell', level: 'info' as const, message: 'primary' }
    const duplicate = { id: 1, t: 2, source: 'page' as const, scope: 'Preset', level: 'warn' as const, message: 'legacy duplicate' }
    const other = { id: 2, t: 3, source: 'admin' as const, scope: 'Admin', level: 'ok' as const, message: 'other' }
    expect(dedupeDebugLogEntriesById([primary, duplicate, other])).toEqual([primary, other])
  })
})
