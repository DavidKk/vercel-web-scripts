import { readFile } from 'fs/promises'
import { join } from 'path'

import { buildChromeExtensionDownloadUrl } from '@/shared/chrome-extension-download'
import {
  buildGithubLatestReleaseApiUrl,
  findChromeExtensionZipDownloadUrl,
  type GithubReleaseAssetLike,
  normalizeGithubReleaseTag,
  parseGithubOwnerRepo,
} from '@/shared/extension-github-release'

import pkg from '../../package.json'

const EXTENSION_MANIFEST_PATH = join(process.cwd(), 'extension/dist/manifest.json')

type ExtensionGithubReleaseInfo = { version: string; downloadUrl: string }

/** Last successful GitHub release only (never store null — avoids poisoning on transient errors). */
let githubReleaseSuccessCache: { at: number; info: ExtensionGithubReleaseInfo } | null = null
const GITHUB_RELEASE_CACHE_TTL_MS = 60_000
const GITHUB_RELEASE_FETCH_TIMEOUT_MS = 3_000

/**
 * Resolve GitHub owner/repo for the formal extension release channel.
 * @returns Owner/repo or null
 */
function resolveExtensionGithubRepo(): { owner: string; repo: string } | null {
  const fromEnv = process.env.EXTENSION_GITHUB_REPO?.trim()
  if (fromEnv) {
    return parseGithubOwnerRepo(fromEnv)
  }
  const repository = (pkg as { repository?: { url?: string } | string }).repository
  const url = typeof repository === 'string' ? repository : repository?.url
  return url ? parseGithubOwnerRepo(url) : null
}

/**
 * Return stale successful release when present (even past TTL).
 * @returns Last known formal release, or null
 */
function getStaleGithubSuccess(): ExtensionGithubReleaseInfo | null {
  return githubReleaseSuccessCache?.info ?? null
}

/**
 * Read semver of the built Chrome extension (falls back to root package.json).
 * @returns Extension version string
 */
export async function getExtensionReleaseVersion(): Promise<string> {
  try {
    const raw = await readFile(EXTENSION_MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw) as { version?: string }
    const version = manifest.version?.trim()
    if (version) {
      return version
    }
  } catch {
    // dist manifest may be missing before first build
  }
  return (pkg as { version?: string }).version?.trim() || '0.0.0'
}

/**
 * Fetch the latest formal Chrome extension release from GitHub Releases.
 * On transient failures, keeps serving the last successful payload when available.
 * @returns Version + asset URL, or null when unavailable / invalid
 */
async function fetchGithubLatestExtensionRelease(): Promise<ExtensionGithubReleaseInfo | null> {
  const now = Date.now()
  if (githubReleaseSuccessCache && now - githubReleaseSuccessCache.at < GITHUB_RELEASE_CACHE_TTL_MS) {
    return githubReleaseSuccessCache.info
  }

  const repo = resolveExtensionGithubRepo()
  if (!repo) {
    return getStaleGithubSuccess()
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'magickmonkey-extension-version',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.EXTENSION_GITHUB_TOKEN?.trim()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const res = await fetch(buildGithubLatestReleaseApiUrl(repo.owner, repo.repo), {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(GITHUB_RELEASE_FETCH_TIMEOUT_MS),
    })
    if (res.status === 404) {
      // No releases yet (or all removed) — clear success so we do not claim a deleted channel.
      githubReleaseSuccessCache = null
      return null
    }
    if (!res.ok) {
      return getStaleGithubSuccess()
    }
    const data = (await res.json()) as {
      tag_name?: string
      assets?: GithubReleaseAssetLike[]
    }
    const version = typeof data.tag_name === 'string' ? normalizeGithubReleaseTag(data.tag_name) : null
    const downloadUrl = findChromeExtensionZipDownloadUrl(data.assets ?? [])
    if (!version || !downloadUrl) {
      // Latest GitHub release is not an extension release — keep prior formal success if any.
      return getStaleGithubSuccess()
    }
    const info = { version, downloadUrl }
    githubReleaseSuccessCache = { at: now, info }
    return info
  } catch {
    return getStaleGithubSuccess()
  }
}

/**
 * Clear GitHub release success cache (unit tests).
 */
export function clearGithubExtensionReleaseCacheForTests(): void {
  githubReleaseSuccessCache = null
}

/**
 * Expire the success-cache TTL so the next call refetches (unit tests).
 */
export function expireGithubExtensionReleaseCacheForTests(): void {
  if (githubReleaseSuccessCache) {
    githubReleaseSuccessCache = {
      ...githubReleaseSuccessCache,
      at: Date.now() - GITHUB_RELEASE_CACHE_TTL_MS - 1,
    }
  }
}

/**
 * Build public extension release metadata for API responses.
 * Prefers the formal GitHub Release channel; falls back to this deployment's packaged version.
 * @param baseUrl Deployment origin from the incoming request (fallback download host)
 * @returns Version and absolute ZIP download URL
 */
export async function getExtensionReleaseInfo(baseUrl: string): Promise<{ version: string; downloadUrl: string }> {
  const fromGithub = await fetchGithubLatestExtensionRelease()
  if (fromGithub) {
    return fromGithub
  }

  // deployment-fallback (transitional): local/dist version + site ZIP path
  const version = await getExtensionReleaseVersion()
  return {
    version,
    downloadUrl: buildChromeExtensionDownloadUrl(baseUrl),
  }
}
