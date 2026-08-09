import { createExtensionLogger } from '@ext/shared/logger'
import { createTraceId } from '@shared/trace-id'

jest.mock('@ext/shared/report-debug-log', () => ({
  reportDebugLog: jest.fn(),
}))

jest.mock('@ext/shared/shell-log-output-cache', () => ({
  shouldExtensionCollectDebugLogs: () => true,
  shouldExtensionLogToConsole: () => false,
}))

import { reportDebugLog } from '@ext/shared/report-debug-log'

describe('extension logger withTrace', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should attach a bound TraceId even when another logger is active concurrently', () => {
    const traceA = createTraceId()
    const traceB = createTraceId()
    expect(traceA).not.toBe(traceB)

    const logger = createExtensionLogger('Extension')
    logger.withTrace(traceA).info('load:a')
    logger.withTrace(traceB).info('load:b')

    expect(reportDebugLog).toHaveBeenCalledTimes(2)
    expect(reportDebugLog).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'load:a',
        meta: { traceId: traceA },
      })
    )
    expect(reportDebugLog).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'load:b',
        meta: { traceId: traceB },
      })
    )
  })
})
