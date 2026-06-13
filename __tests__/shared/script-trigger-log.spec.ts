import {
  formatScriptExecutingFailureLog,
  formatScriptExecutingLog,
  parseScriptExecutingFailureLog,
  parseScriptExecutingLog,
  reportExtensionScriptFailed,
} from '../../shared/script-trigger-log'

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

  it('reportExtensionScriptFailed posts SCRIPT_FAILED when page config exists', () => {
    const posted: unknown[] = []
    const events: string[] = []
    const pageWindow = {
      __VWS_PAGE_CONFIG__: { scriptKey: 'abc' },
      postMessage: (data: unknown) => {
        posted.push(data)
      },
      dispatchEvent: (event: Event) => {
        events.push(event.type)
        return true
      },
    } as unknown as Window & { __VWS_PAGE_CONFIG__?: { scriptKey: string } }
    const previous = globalThis.window
    Object.defineProperty(globalThis, 'window', { configurable: true, value: pageWindow })
    try {
      reportExtensionScriptFailed('preset-core', 'failed', 'abc')
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: previous })
    }
    expect(events).toContain('vws-script-failed')
    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({
      type: 'vws-script-failed',
      payload: { file: 'preset-core', runAt: 'failed', scriptKey: 'abc' },
    })
  })
})
