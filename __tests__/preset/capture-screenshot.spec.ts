jest.mock('../../preset/src/helpers/env', () => ({
  isExtensionPageContext: jest.fn(),
}))

jest.mock('@shared/script-permission-scope', () => ({
  readPermissionHosts: jest.fn(),
}))

import { readPermissionHosts } from '@shared/script-permission-scope'

import { isExtensionPageContext } from '@/helpers/env'

import { GME_captureScreenshot, GME_downloadScreenshot } from '../../preset/src/helpers/capture-screenshot'

const mockedIsExtensionPageContext = isExtensionPageContext as jest.MockedFunction<typeof isExtensionPageContext>
const mockedReadPermissionHosts = readPermissionHosts as jest.MockedFunction<typeof readPermissionHosts>

describe('GME_captureScreenshot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsExtensionPageContext.mockReturnValue(true)
  })

  it('should throw when not running in extension page context', async () => {
    mockedIsExtensionPageContext.mockReturnValue(false)

    await expect(GME_captureScreenshot()).rejects.toThrow('GME_captureScreenshot requires MagickMonkey Chrome extension')
  })

  it('should throw when GM_captureVisibleTab is unavailable', async () => {
    mockedReadPermissionHosts.mockReturnValue([{}])

    await expect(GME_captureScreenshot()).rejects.toThrow('GME_captureScreenshot: GM_captureVisibleTab is not available')
  })

  it('should delegate capture to GM_captureVisibleTab from permission hosts', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    const capture = jest.fn().mockResolvedValue(blob)
    mockedReadPermissionHosts.mockReturnValue([{ GM_captureVisibleTab: capture }])

    const result = await GME_captureScreenshot({ format: 'png', quality: 90 })

    expect(capture).toHaveBeenCalledWith({ format: 'png', quality: 90 })
    expect(result).toBe(blob)
  })
})

describe('GME_downloadScreenshot', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsExtensionPageContext.mockReturnValue(true)
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-02T12:34:56.789Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('should download captured blob via GM_download with a timestamped filename', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    const capture = jest.fn().mockResolvedValue(blob)
    const download = jest.fn(({ onload }: { onload?: () => void }) => {
      onload?.()
      return { abort: jest.fn() }
    })
    mockedReadPermissionHosts.mockReturnValue([{ GM_captureVisibleTab: capture, GM_download: download }])

    await GME_downloadScreenshot({ format: 'png' })

    expect(capture).toHaveBeenCalledWith({ format: 'png' })
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: blob,
        name: 'page-viewport-2026-07-02T12-34-56.png',
      })
    )
  })

  it('should reject when GM_download is unavailable', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    mockedReadPermissionHosts.mockReturnValue([{ GM_captureVisibleTab: jest.fn().mockResolvedValue(blob) }])

    await expect(GME_downloadScreenshot()).rejects.toThrow('GME_downloadScreenshot requires GM_download')
  })
})
