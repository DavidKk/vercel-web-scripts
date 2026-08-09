import { buildGithubLatestReleaseApiUrl, findChromeExtensionZipDownloadUrl, normalizeGithubReleaseTag, parseGithubOwnerRepo } from '@shared/extension-github-release'

describe('extension-github-release', () => {
  it('should parse owner/repo from GitHub URLs and shorthand', () => {
    expect(parseGithubOwnerRepo('DavidKk/vercel-web-scripts')).toEqual({ owner: 'DavidKk', repo: 'vercel-web-scripts' })
    expect(parseGithubOwnerRepo('https://github.com/DavidKk/vercel-web-scripts.git')).toEqual({
      owner: 'DavidKk',
      repo: 'vercel-web-scripts',
    })
    expect(parseGithubOwnerRepo('git@github.com:DavidKk/vercel-web-scripts.git')).toEqual({
      owner: 'DavidKk',
      repo: 'vercel-web-scripts',
    })
    expect(parseGithubOwnerRepo('https://gitlab.com/a/b')).toBeNull()
  })

  it('should normalize release tags to X.Y.Z', () => {
    expect(normalizeGithubReleaseTag('v0.2.3')).toBe('0.2.3')
    expect(normalizeGithubReleaseTag('0.2.3')).toBe('0.2.3')
    expect(normalizeGithubReleaseTag('v0.2.3-beta')).toBeNull()
  })

  it('should pick the formal extension ZIP asset URL', () => {
    expect(
      findChromeExtensionZipDownloadUrl([
        { name: 'other.zip', browser_download_url: 'https://example.com/other.zip' },
        {
          name: 'magickmonkey-chrome-extension.zip',
          browser_download_url: 'https://github.com/o/r/releases/download/v1.0.0/magickmonkey-chrome-extension.zip',
        },
      ])
    ).toBe('https://github.com/o/r/releases/download/v1.0.0/magickmonkey-chrome-extension.zip')
    expect(findChromeExtensionZipDownloadUrl([])).toBeNull()
  })

  it('should build the latest-release API URL', () => {
    expect(buildGithubLatestReleaseApiUrl('DavidKk', 'vercel-web-scripts')).toBe('https://api.github.com/repos/DavidKk/vercel-web-scripts/releases/latest')
  })
})
