import { DEBUG_LOG_MESSAGE_MAX_CHARS } from '../../extension/src/shared/debug-log-types'
import { parseDebugLogHost, truncateDebugLogMessage } from '../../extension/src/shared/debug-log-utils'

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
})
