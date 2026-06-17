import { fetchExtensionUpdateInfo } from '@ext/shared/extension-update-check'

describe('extension-update-check', () => {
  it('should detect newer extension version from API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '0.2.0',
        downloadUrl: 'https://example.com/downloads/magickmonkey-chrome-extension.zip',
      }),
    }) as typeof fetch

    await expect(fetchExtensionUpdateInfo('https://example.com/', '0.1.0')).resolves.toEqual({
      updateAvailable: true,
      latestVersion: '0.2.0',
      downloadUrl: 'https://example.com/downloads/magickmonkey-chrome-extension.zip',
    })

    expect(global.fetch).toHaveBeenCalledWith('https://example.com/api/extension/version', { cache: 'no-store' })
  })

  it('should return no update when installed version is current', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '0.1.0',
        downloadUrl: 'https://example.com/downloads/magickmonkey-chrome-extension.zip',
      }),
    }) as typeof fetch

    await expect(fetchExtensionUpdateInfo('https://example.com', '0.1.0')).resolves.toEqual({
      updateAvailable: false,
      latestVersion: '0.1.0',
      downloadUrl: 'https://example.com/downloads/magickmonkey-chrome-extension.zip',
    })
  })

  it('should return empty result when baseUrl is missing', async () => {
    await expect(fetchExtensionUpdateInfo('', '0.1.0')).resolves.toEqual({
      updateAvailable: false,
      latestVersion: null,
      downloadUrl: null,
    })
  })
})
