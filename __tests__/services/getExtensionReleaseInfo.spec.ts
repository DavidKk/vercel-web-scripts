import { buildChromeExtensionDownloadUrl } from '@shared/chrome-extension-download'

import {
  clearGithubExtensionReleaseCacheForTests,
  expireGithubExtensionReleaseCacheForTests,
  getExtensionReleaseInfo,
  getExtensionReleaseVersion,
} from '../../services/extension/getExtensionReleaseInfo'

describe('getExtensionReleaseInfo', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    clearGithubExtensionReleaseCacheForTests()
  })

  afterEach(() => {
    global.fetch = originalFetch
    clearGithubExtensionReleaseCacheForTests()
  })

  it('should prefer GitHub latest release version and asset URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v9.8.7',
        assets: [
          {
            name: 'magickmonkey-chrome-extension.zip',
            browser_download_url: 'https://github.com/example/repo/releases/download/v9.8.7/magickmonkey-chrome-extension.zip',
          },
        ],
      }),
    }) as unknown as typeof fetch

    const info = await getExtensionReleaseInfo('https://deploy.example.com')
    expect(info.version).toBe('9.8.7')
    expect(info.downloadUrl).toBe('https://github.com/example/repo/releases/download/v9.8.7/magickmonkey-chrome-extension.zip')
  })

  it('should fall back to deployment package when GitHub has no ZIP asset', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.0',
        assets: [{ name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' }],
      }),
    }) as unknown as typeof fetch

    const info = await getExtensionReleaseInfo('https://deploy.example.com')
    expect(info.downloadUrl).toBe(buildChromeExtensionDownloadUrl('https://deploy.example.com'))
    expect(info.version).toBe(await getExtensionReleaseVersion())
  })

  it('should fall back when GitHub request fails with no prior success', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch

    const info = await getExtensionReleaseInfo('https://deploy.example.com/')
    expect(info.downloadUrl).toBe('https://deploy.example.com/downloads/magickmonkey-chrome-extension.zip')
  })

  it('should keep last successful GitHub release when a later fetch fails', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v9.8.7',
          assets: [
            {
              name: 'magickmonkey-chrome-extension.zip',
              browser_download_url: 'https://github.com/example/repo/releases/download/v9.8.7/magickmonkey-chrome-extension.zip',
            },
          ],
        }),
      })
      .mockRejectedValueOnce(new Error('network')) as unknown as typeof fetch

    const first = await getExtensionReleaseInfo('https://deploy.example.com')
    expect(first.version).toBe('9.8.7')

    expireGithubExtensionReleaseCacheForTests()
    const second = await getExtensionReleaseInfo('https://deploy.example.com')
    expect(second.version).toBe('9.8.7')
    expect(second.downloadUrl).toContain('v9.8.7/magickmonkey-chrome-extension.zip')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('should normalize trailing slash on fallback baseUrl', () => {
    expect(buildChromeExtensionDownloadUrl('https://deploy.example.com/')).toBe('https://deploy.example.com/downloads/magickmonkey-chrome-extension.zip')
  })
})
