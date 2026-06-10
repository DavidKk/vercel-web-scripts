import { EXTENSION_VERSION_API_PATH, type ExtensionVersionApiResponse } from '@shared/extension-version-api'
import { isSemverNewer } from '@shared/semver-compare'

/** Result of comparing installed extension version against server release. */
export interface ExtensionUpdateInfo {
  updateAvailable: boolean
  latestVersion: string | null
  downloadUrl: string | null
}

/**
 * Fetch latest extension release from the MagickMonkey server and compare semver.
 * @param baseUrl MagickMonkey server origin from Options
 * @param currentVersion Installed extension manifest version
 * @returns Update availability and download URL when server responds
 */
export async function fetchExtensionUpdateInfo(baseUrl: string, currentVersion: string): Promise<ExtensionUpdateInfo> {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (!normalized) {
    return { updateAvailable: false, latestVersion: null, downloadUrl: null }
  }
  try {
    const res = await fetch(`${normalized}${EXTENSION_VERSION_API_PATH}`, { cache: 'no-store' })
    if (!res.ok) {
      return { updateAvailable: false, latestVersion: null, downloadUrl: null }
    }
    const data = (await res.json()) as ExtensionVersionApiResponse
    const latestVersion = typeof data.version === 'string' && data.version.trim() ? data.version.trim() : null
    const downloadUrl = typeof data.downloadUrl === 'string' && data.downloadUrl.trim() ? data.downloadUrl.trim() : null
    if (!latestVersion) {
      return { updateAvailable: false, latestVersion: null, downloadUrl }
    }
    return {
      updateAvailable: isSemverNewer(latestVersion, currentVersion.trim() || '0.0.0'),
      latestVersion,
      downloadUrl,
    }
  } catch {
    return { updateAvailable: false, latestVersion: null, downloadUrl: null }
  }
}
