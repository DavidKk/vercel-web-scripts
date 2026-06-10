import { readFile } from 'fs/promises'
import { join } from 'path'

import { buildChromeExtensionDownloadUrl } from '@/shared/chrome-extension-download'

import pkg from '../../package.json'

const EXTENSION_MANIFEST_PATH = join(process.cwd(), 'extension/dist/manifest.json')

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
 * Build public extension release metadata for API responses.
 * @param baseUrl Deployment origin from the incoming request
 * @returns Version and absolute ZIP download URL
 */
export async function getExtensionReleaseInfo(baseUrl: string): Promise<{ version: string; downloadUrl: string }> {
  const version = await getExtensionReleaseVersion()
  return {
    version,
    downloadUrl: buildChromeExtensionDownloadUrl(baseUrl),
  }
}
