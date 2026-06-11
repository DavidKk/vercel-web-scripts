import {
  setCachedShellLogOutputMode,
  shouldExtensionCollectDebugLogs,
  shouldExtensionLogToConsole,
  syncShellLogOutputModeFromGmStore,
} from '../../extension/src/shared/shell-log-output-cache'
import { SHELL_LOG_OUTPUT_MODE_KEY } from '../../shared/shell-log-output'

describe('shell-log-output-cache', () => {
  afterEach(() => {
    setCachedShellLogOutputMode('console')
  })

  it('syncShellLogOutputModeFromGmStore updates extension console gating', () => {
    setCachedShellLogOutputMode('console')
    syncShellLogOutputModeFromGmStore({ [SHELL_LOG_OUTPUT_MODE_KEY]: 'logviewer' })
    expect(shouldExtensionLogToConsole()).toBe(false)
  })

  it('setCachedShellLogOutputMode applies none mode', () => {
    setCachedShellLogOutputMode('none')
    expect(shouldExtensionLogToConsole()).toBe(false)
    expect(shouldExtensionCollectDebugLogs()).toBe(false)
  })

  it('shouldExtensionCollectDebugLogs follows logviewer mode', () => {
    setCachedShellLogOutputMode('logviewer')
    expect(shouldExtensionCollectDebugLogs()).toBe(true)
    expect(shouldExtensionLogToConsole()).toBe(false)
  })
})
