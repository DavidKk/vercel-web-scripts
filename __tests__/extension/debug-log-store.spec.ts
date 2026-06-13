import { appendDebugLog, clearDebugLogs, getDebugLogSnapshot, setDebugLogCollectionGate, setIncognitoLogCollectionGate } from '../../extension/src/shell/debug-log-store'

describe('debug-log-store', () => {
  beforeEach(() => {
    clearDebugLogs()
    setDebugLogCollectionGate(() => true)
    setIncognitoLogCollectionGate(() => false)
  })

  it('should append entries with monotonic ids', () => {
    appendDebugLog({ source: 'background', scope: 'Extension', level: 'info', message: 'hello' })
    appendDebugLog({ source: 'popup', scope: 'Popup', level: 'ok', message: 'world' })
    const snapshot = getDebugLogSnapshot()
    expect(snapshot).toHaveLength(2)
    expect(snapshot[0].id).toBe(1)
    expect(snapshot[1].id).toBe(2)
    expect(snapshot[0].message).toBe('hello')
  })

  it('should keep incognito and normal entries in one buffer', () => {
    appendDebugLog({ source: 'page', scope: 'Preset', level: 'info', message: 'normal', meta: { incognito: false } })
    setIncognitoLogCollectionGate(() => true)
    appendDebugLog({ source: 'page', scope: 'Preset', level: 'warn', message: 'private', meta: { incognito: true } })
    expect(getDebugLogSnapshot().map((entry) => entry.message)).toEqual(['normal', 'private'])
  })

  it('should skip incognito entries when incognito collection is disabled', () => {
    appendDebugLog({ source: 'page', scope: 'Preset', level: 'warn', message: 'private', meta: { incognito: true } })
    appendDebugLog({ source: 'background', scope: 'Extension', level: 'info', message: 'normal' })
    expect(getDebugLogSnapshot().map((entry) => entry.message)).toEqual(['normal'])
  })

  it('should drop oldest entries when exceeding max buffer size', () => {
    for (let i = 0; i < 1002; i++) {
      appendDebugLog({ source: 'background', scope: 'Extension', level: 'debug', message: `line-${i}` })
    }
    const snapshot = getDebugLogSnapshot()
    expect(snapshot).toHaveLength(1000)
    expect(snapshot[0].message).toBe('line-2')
    expect(snapshot.at(-1)?.message).toBe('line-1001')
  })

  it('should not collect when gate is disabled', () => {
    setDebugLogCollectionGate(() => false)
    appendDebugLog({ source: 'background', scope: 'Extension', level: 'info', message: 'ignored' })
    expect(getDebugLogSnapshot()).toHaveLength(0)
  })

  it('should clear the unified session buffer', () => {
    setIncognitoLogCollectionGate(() => true)
    appendDebugLog({ source: 'admin', scope: 'Admin', level: 'warn', message: 'normal', meta: { incognito: false } })
    appendDebugLog({ source: 'admin', scope: 'Admin', level: 'warn', message: 'private', meta: { incognito: true } })
    clearDebugLogs()
    expect(getDebugLogSnapshot()).toHaveLength(0)
  })
})
