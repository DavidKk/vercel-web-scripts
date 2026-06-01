import { formatScriptExecutingFailureLog, formatScriptExecutingLog, parseScriptExecutingFailureLog, parseScriptExecutingLog } from '../../shared/script-trigger-log'

describe('script-trigger-log', () => {
  it('formats and parses executing script log lines', () => {
    const line = formatScriptExecutingLog('foo.ts', '1/1/2026')
    expect(line).toBe('Executing script `foo.ts` (built 1/1/2026)')
    expect(parseScriptExecutingLog(line)).toBe('foo.ts')
  })

  it('returns null for non-matching log lines', () => {
    expect(parseScriptExecutingLog('Remote script ready.')).toBeNull()
    expect(parseScriptExecutingLog(42)).toBeNull()
  })

  it('formats and parses failed execution log lines', () => {
    const line = formatScriptExecutingFailureLog('broken.ts')
    expect(line).toBe('Executing script `broken.ts` failed:')
    expect(parseScriptExecutingFailureLog(line)).toBe('broken.ts')
  })
})
