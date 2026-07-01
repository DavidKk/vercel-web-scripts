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

function buildScreenshotFilename(format: 'png' | 'jpeg'): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return format === 'jpeg' ? `page-viewport-${stamp}.jpg` : `page-viewport-${stamp}.png`
}

/**
 * Capture the visible viewport of the current browser tab (extension shell only).
 * Delegates to `GM_captureVisibleTab`, which uses `chrome.tabs.captureVisibleTab` and
 * prompts for `capture-screenshot` permission on the current page host.
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

/**
 * Capture the visible viewport and download via `GM_download` (extension shell only).
 * Prompts for `capture-screenshot` on the page host and `download` (`*`) when saving the blob.
 * @param options Optional image format and JPEG quality
 */
export async function GME_downloadScreenshot(options?: CaptureScreenshotOptions): Promise<void> {
  const format = options?.format ?? 'png'
  const blob = await GME_captureScreenshot({ ...options, format })
  const name = buildScreenshotFilename(format === 'jpeg' ? 'jpeg' : 'png')
  await downloadScreenshotBlob(blob, name)
}

function downloadScreenshotBlob(blob: Blob, name: string): Promise<void> {
  const download = resolveGmApi<typeof GM_download>('GM_download')
  if (!download) {
    throw new Error('GME_downloadScreenshot requires GM_download')
  }
  return new Promise((resolve, reject) => {
    download({
      url: blob,
      name,
      onload: () => resolve(),
      onerror: (error) => reject(new Error(error.error || 'Screenshot download failed')),
    })
  })
}
