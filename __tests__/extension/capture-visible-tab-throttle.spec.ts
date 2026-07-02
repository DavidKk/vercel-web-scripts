import {
  CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS,
  captureVisibleTabThrottled,
  isCaptureVisibleTabQuotaError,
  resetCaptureVisibleTabThrottleForTests,
} from '@ext/shell/capture-visible-tab-throttle'

function installChromeCaptureMock(handler: (callback: (dataUrl?: string) => void) => void): void {
  const runtime: { lastError?: { message: string } } = {}
  ;(globalThis as unknown as { chrome?: { runtime: typeof runtime; tabs: Record<string, unknown> } }).chrome = {
    runtime,
    tabs: {
      captureVisibleTab: jest.fn((_windowId: number, _options: unknown, callback: (dataUrl?: string) => void) => {
        handler(callback)
      }),
    },
  }
}

describe('isCaptureVisibleTabQuotaError', () => {
  it('should detect Chrome quota errors', () => {
    expect(isCaptureVisibleTabQuotaError(new Error('This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.'))).toBe(true)
    expect(isCaptureVisibleTabQuotaError(new Error('other'))).toBe(false)
  })
})

describe('captureVisibleTabThrottled', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    resetCaptureVisibleTabThrottleForTests()
    installChromeCaptureMock((callback) => {
      callback('data:image/png;base64,abc')
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should wait MIN_INTERVAL_MS before every capture call', async () => {
    const pending = captureVisibleTabThrottled(1, { format: 'png' })
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS - 1)
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(1)
    await expect(pending).resolves.toBe('data:image/png;base64,abc')
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1)
  })

  it('should serialize callers and wait MIN_INTERVAL_MS for each', async () => {
    const first = captureVisibleTabThrottled(1, { format: 'png' })
    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    await first

    const second = captureVisibleTabThrottled(1, { format: 'png' })
    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS - 1)
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(1)
    await second
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(2)
  })

  it('should not burst when many callers enqueue concurrently', async () => {
    const first = captureVisibleTabThrottled(1, { format: 'png' })
    const second = captureVisibleTabThrottled(1, { format: 'png' })
    const third = captureVisibleTabThrottled(1, { format: 'png' })

    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    await first
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    await second
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(2)

    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    await third
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(3)
  })

  it('should retry on quota errors after another MIN_INTERVAL_MS wait', async () => {
    let calls = 0
    installChromeCaptureMock((callback) => {
      calls++
      if (calls === 1) {
        chrome.runtime.lastError = { message: 'This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.' }
        callback(undefined)
        delete chrome.runtime.lastError
        return
      }
      callback('data:image/png;base64,ok')
    })

    const pending = captureVisibleTabThrottled(1, { format: 'png' })
    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(1)

    await jest.advanceTimersByTimeAsync(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    await expect(pending).resolves.toBe('data:image/png;base64,ok')
    expect(chrome.tabs.captureVisibleTab).toHaveBeenCalledTimes(2)
  })
})
