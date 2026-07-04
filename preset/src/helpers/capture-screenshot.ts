import { readPermissionHosts } from '@shared/script-permission-scope'

import { isExtensionPageContext } from '@/helpers/env'

/** Options for {@link GME_captureScreenshot}. */
export interface CaptureScreenshotOptions {
  /** Image format; default `png`. */
  format?: 'png' | 'jpeg'
  /** JPEG quality 0–100; ignored for PNG. */
  quality?: number
}

/** Resolve a GM API from launcher sandbox hosts (`__GLOBAL__` first), not isolated `globalThis`. */
function resolveGmApi<T extends (...args: never[]) => unknown>(name: string): T | undefined {
  for (const host of readPermissionHosts()) {
    const fn = host[name]
    if (typeof fn === 'function') {
      return fn as T
    }
  }
  return undefined
}

/**
 * Capture the visible viewport of the current browser tab (extension shell only).
 * Delegates to `GM_captureVisibleTab`, which uses `chrome.tabs.captureVisibleTab` and
 * prompts for `capture-screenshot` permission on the current page host.
 * Download, clipboard, and UI flow are left to user scripts (`GM_download`, `GM_setClipboard`, etc.).
 * @param options Optional image format and JPEG quality
 * @returns PNG or JPEG blob of the visible tab area
 */
export async function GME_captureScreenshot(options?: CaptureScreenshotOptions): Promise<Blob> {
  if (!isExtensionPageContext()) {
    throw new Error('GME_captureScreenshot requires MagickMonkey Chrome extension')
  }

  const capture = resolveGmApi<(opts?: CaptureScreenshotOptions) => Promise<Blob>>('GM_captureVisibleTab')
  if (!capture) {
    throw new Error('GME_captureScreenshot: GM_captureVisibleTab is not available')
  }

  return capture(options)
}
