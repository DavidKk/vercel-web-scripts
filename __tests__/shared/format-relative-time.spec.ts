import { formatAbsoluteTime24h, formatRelativeTime, toEpochMs } from '@shared/format-relative-time'

describe('format-relative-time', () => {
  const now = Date.UTC(2026, 6, 15, 10, 30, 0)

  it('should coerce date-like inputs to epoch ms', () => {
    expect(toEpochMs(now)).toBe(now)
    expect(toEpochMs(new Date(now))).toBe(now)
    expect(toEpochMs(Number.NaN, 123)).toBe(123)
  })

  it('should format recent times as compact relative labels', () => {
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now')
    expect(formatRelativeTime(now - 60_000, now)).toBe('1min ago')
    expect(formatRelativeTime(now - 23 * 60_000, now)).toBe('23min ago')
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe('3h ago')
  })

  it('should fall back to 24h absolute time for older values', () => {
    const older = now - 26 * 60 * 60_000
    expect(formatRelativeTime(older, now)).toBe(formatAbsoluteTime24h(older, now))
    expect(formatAbsoluteTime24h(older, now)).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/)
  })
})
