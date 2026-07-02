import { createExtensionLogger } from '../shared/logger'

const throttleLogger = createExtensionLogger('Screenshot')

/** Wait after scroll before capture so paint/layout can settle. */
export const CAPTURE_SCROLL_SETTLE_MS = 200

/** Fixed wait before each `captureVisibleTab` attempt (Chrome MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND ≈ 2/sec). */
export const CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS = 800

const CAPTURE_QUOTA_MAX_RETRIES = 8

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fixed capture interval exposed for tests and diagnostics.
 */
export function getCaptureVisibleTabMinIntervalMs(): number {
  return CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS
}

/**
 * Whether an error is Chrome's per-second captureVisibleTab quota.
 * @param error Rejected capture error
 */
export function isCaptureVisibleTabQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return msg.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')
}

function invokeCaptureVisibleTab(windowId: number, options: chrome.tabs.CaptureVisibleTabOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
        const err = chrome.runtime.lastError
        if (err) {
          reject(new Error(err.message))
          return
        }
        if (!dataUrl) {
          reject(new Error('captureVisibleTab returned empty data'))
          return
        }
        resolve(dataUrl)
      })
    } catch (error) {
      reject(error)
    }
  })
}

async function captureVisibleTabWithQuotaRetry(windowId: number, options: chrome.tabs.CaptureVisibleTabOptions): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < CAPTURE_QUOTA_MAX_RETRIES; attempt++) {
    try {
      return await invokeCaptureVisibleTab(windowId, options)
    } catch (error) {
      lastError = error
      if (!isCaptureVisibleTabQuotaError(error) || attempt >= CAPTURE_QUOTA_MAX_RETRIES - 1) {
        throw error
      }
      throttleLogger.warn('capture:throttle-quota-retry', { attempt: attempt + 1 })
      await delay(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('captureVisibleTab failed')
}

/**
 * Global singleton gate: concurrent enqueue calls are serialized on one lane.
 * A job only starts its interval wait after the previous job fully finished (wait + capture).
 */
class CaptureVisibleTabGate {
  private static instance: CaptureVisibleTabGate | undefined

  private tail: Promise<void> = Promise.resolve()

  private queued = 0

  static getInstance(): CaptureVisibleTabGate {
    CaptureVisibleTabGate.instance ??= new CaptureVisibleTabGate()
    return CaptureVisibleTabGate.instance
  }

  static resetForTests(): void {
    CaptureVisibleTabGate.instance = undefined
  }

  /**
   * Enqueue async work on the single global lane.
   * @param task Capture work to run when this job reaches the front of the queue
   */
  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const position = ++this.queued
    throttleLogger.info('capture:queue-enqueue', { position })

    const job = this.tail.then(async () => {
      throttleLogger.info('capture:queue-run', { position, waitMs: CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS })
      await delay(CAPTURE_VISIBLE_TAB_MIN_INTERVAL_MS)
      return task()
    })

    this.tail = job.then(
      () => {
        this.queued = Math.max(0, this.queued - 1)
      },
      () => {
        this.queued = Math.max(0, this.queued - 1)
      }
    )

    return job
  }
}

/**
 * **唯一入口**：全扩展所有 `captureVisibleTab` 必须经过此函数。
 * 单例队列串行执行；并发调用只会排队，不会在同一个间隔窗口内同时触发 Chrome API。
 * @param windowId Target window id
 * @param options Capture format/quality
 * @returns PNG/JPEG data URL
 */
export async function captureVisibleTabThrottled(windowId: number, options: chrome.tabs.CaptureVisibleTabOptions = { format: 'png' }): Promise<string> {
  return CaptureVisibleTabGate.getInstance().enqueue(() => captureVisibleTabWithQuotaRetry(windowId, options))
}

/** Reset singleton gate (unit tests). */
export function resetCaptureVisibleTabThrottleForTests(): void {
  CaptureVisibleTabGate.resetForTests()
}
