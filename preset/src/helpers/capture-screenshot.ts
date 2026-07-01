import { isExtensionPageContext } from '@/helpers/env'

/** Options for {@link GME_captureScreenshot}. */
export interface CaptureScreenshotOptions {
  /** Image format; default `png`. */
  format?: 'png' | 'jpeg'
  /** JPEG quality 0–100; ignored for PNG. */
  quality?: number
}

/**
 * Capture the visible viewport of the current browser tab (extension shell only).
 * Delegates to `GM_captureVisibleTab`, which uses `chrome.tabs.captureVisibleTab` and
 * prompts for `capture-screenshot` permission on the current page host.
 * @param options Optional format and JPEG quality
 * @returns PNG or JPEG blob of the visible tab area
 */
export async function GME_captureScreenshot(options?: CaptureScreenshotOptions): Promise<Blob> {
  if (!isExtensionPageContext()) {
    throw new Error('GME_captureScreenshot requires MagickMonkey Chrome extension')
  }

  const capture = (globalThis as Record<string, unknown>).GM_captureVisibleTab
  if (typeof capture !== 'function') {
    throw new Error('GME_captureScreenshot: GM_captureVisibleTab is not available')
  }

  return (capture as (opts?: CaptureScreenshotOptions) => Promise<Blob>)(options)
}
