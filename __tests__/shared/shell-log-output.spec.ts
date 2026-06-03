import { DEFAULT_SHELL_LOG_OUTPUT_MODE, normalizeShellLogOutputMode, shouldLogToConsoleForMode, shouldLogToMemoryForMode } from '../../shared/shell-log-output'

describe('shell-log-output', () => {
  it('defaults to console mode', () => {
    expect(normalizeShellLogOutputMode(undefined)).toBe(DEFAULT_SHELL_LOG_OUTPUT_MODE)
    expect(normalizeShellLogOutputMode('invalid')).toBe('console')
  })

  it('maps modes to console and memory sinks', () => {
    expect(shouldLogToConsoleForMode('console')).toBe(true)
    expect(shouldLogToConsoleForMode('logviewer')).toBe(false)
    expect(shouldLogToMemoryForMode('console')).toBe(true)
    expect(shouldLogToMemoryForMode('logviewer')).toBe(true)
    expect(shouldLogToMemoryForMode('none')).toBe(false)
  })
})
