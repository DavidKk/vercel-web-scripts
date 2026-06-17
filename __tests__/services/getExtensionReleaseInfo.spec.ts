import { buildChromeExtensionDownloadUrl } from '@shared/chrome-extension-download'

import { getExtensionReleaseInfo, getExtensionReleaseVersion } from '../../services/extension/getExtensionReleaseInfo'

describe('getExtensionReleaseInfo', () => {
  it('should build download URL from request origin', async () => {
    const info = await getExtensionReleaseInfo('https://deploy.example.com')
    expect(info.downloadUrl).toBe('https://deploy.example.com/downloads/magickmonkey-chrome-extension.zip')
    expect(info.version).toBe(await getExtensionReleaseVersion())
  })

  it('should normalize trailing slash on baseUrl', () => {
    expect(buildChromeExtensionDownloadUrl('https://deploy.example.com/')).toBe('https://deploy.example.com/downloads/magickmonkey-chrome-extension.zip')
  })
})
