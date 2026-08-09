/** Helpers for MagickMonkey Chrome extension GitHub Releases (formal channel). */

import { CHROME_EXTENSION_ZIP_FILENAME } from './chrome-extension-download'

/** Parsed GitHub owner/repo. */
export interface GithubOwnerRepo {
  owner: string
  repo: string
}

/**
 * Parse `owner/repo` from a git remote or `package.json` repository URL.
 * @param repositoryUrl Repository URL or `owner/repo` shorthand
 * @returns Owner and repo, or null when not a GitHub repo URL
 */
export function parseGithubOwnerRepo(repositoryUrl: string): GithubOwnerRepo | null {
  const raw = repositoryUrl.trim()
  if (!raw) {
    return null
  }
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    const [owner, repo] = raw.split('/')
    return owner && repo ? { owner, repo } : null
  }
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(raw)
  if (ssh?.[1] && ssh[2]) {
    return { owner: ssh[1], repo: ssh[2] }
  }
  const https = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i.exec(raw)
  if (https?.[1] && https[2]) {
    return { owner: https[1], repo: https[2].replace(/\/$/, '') }
  }
  return null
}

/**
 * Normalize a GitHub release tag to strict `X.Y.Z` (strip leading `v`).
 * @param tagName Release `tag_name`
 * @returns Semver without leading `v`, or null when not `X.Y.Z`
 */
export function normalizeGithubReleaseTag(tagName: string): string | null {
  const normalized = tagName.trim().replace(/^v/i, '')
  return /^\d+\.\d+\.\d+$/.test(normalized) ? normalized : null
}

/** Minimal GitHub release asset shape used for ZIP selection. */
export interface GithubReleaseAssetLike {
  name?: string
  browser_download_url?: string
}

/**
 * Pick the formal Chrome extension ZIP download URL from release assets.
 * @param assets GitHub release assets
 * @returns `browser_download_url` when the expected ZIP name is present
 */
export function findChromeExtensionZipDownloadUrl(assets: readonly GithubReleaseAssetLike[]): string | null {
  const match = assets.find((asset) => asset.name === CHROME_EXTENSION_ZIP_FILENAME)
  const url = match?.browser_download_url?.trim()
  return url || null
}

/**
 * Build the GitHub Releases API URL for the latest release.
 * @param owner Repo owner
 * @param repo Repo name
 * @returns API URL
 */
export function buildGithubLatestReleaseApiUrl(owner: string, repo: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`
}
