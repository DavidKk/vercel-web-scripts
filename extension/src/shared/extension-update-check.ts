import { EXTENSION_VERSION_API_PATH, type ExtensionVersionApiResponse } from '@shared/extension-version-api'
import { isSemverNewer } from '@shared/semver-compare'

import { fetchWithTimeout } from './fetch-with-timeout'

/** Result of comparing installed extension version against server release. */
export interface ExtensionUpdateInfo {
  updateAvailable: boolean
  latestVersion: string | null
  downloadUrl: string | null
}

const EXTENSION_UPDATE_CACHE_TTL_MS = 5 * 60_000
let extensionUpdateCache: { baseUrl: string; currentVersion: string; at: number; result: ExtensionUpdateInfo } | null = null

/**
 * Fetch latest extension release from the MagickMonkey server and compare semver.
 * @param baseUrl MagickMonkey server origin from Options
 * @param currentVersion Installed extension manifest version
 * @returns Update availability and download URL when server responds
 */
export async function fetchExtensionUpdateInfo(baseUrl: string, currentVersion: string): Promise<ExtensionUpdateInfo> {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  const version = currentVersion.trim() || '0.0.0'
  if (!normalized) {
    return { updateAvailable: false, latestVersion: null, downloadUrl: null }
  }
  const now = Date.now()
  if (
    extensionUpdateCache &&
    extensionUpdateCache.baseUrl === normalized &&
    extensionUpdateCache.currentVersion === version &&
    now - extensionUpdateCache.at < EXTENSION_UPDATE_CACHE_TTL_MS
  ) {
    return extensionUpdateCache.result
  }
  try {
    const res = await fetchWithTimeout(`${normalized}${EXTENSION_VERSION_API_PATH}`, { cache: 'no-store' })
    if (!res.ok) {
      return { updateAvailable: false, latestVersion: null, downloadUrl: null }
    }
    const data = (await res.json()) as ExtensionVersionApiResponse
    const latestVersion = typeof data.version === 'string' && data.version.trim() ? data.version.trim() : null
    const downloadUrl = typeof data.downloadUrl === 'string' && data.downloadUrl.trim() ? data.downloadUrl.trim() : null
    if (!latestVersion) {
      const empty = { updateAvailable: false, latestVersion: null, downloadUrl }
      extensionUpdateCache = { baseUrl: normalized, currentVersion: version, at: now, result: empty }
      return empty
    }
    const result = {
      updateAvailable: isSemverNewer(latestVersion, version),
      latestVersion,
      downloadUrl,
    }
    extensionUpdateCache = { baseUrl: normalized, currentVersion: version, at: now, result }
    return result
  } catch {
    return { updateAvailable: false, latestVersion: null, downloadUrl: null }
  }
}
