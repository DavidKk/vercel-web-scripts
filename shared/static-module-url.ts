/**
 * Helpers for content-addressed `/static/[key]/[hash]/module.js` URLs.
 */

/**
 * Extract SHA-1 content hash from a static module URL path segment.
 * @param url Absolute or relative static module URL
 * @param moduleFile Module file name (e.g. `preset-ui.js`)
 * @returns 40-char hex hash or null when not present
 */
export function extractStaticModuleHash(url: string, moduleFile: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) {
    return null
  }
  const escaped = moduleFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = trimmed.match(new RegExp(`/([a-f0-9]{40})/${escaped}(?:$|[?#])`, 'i'))
  return match?.[1] ?? null
}

/**
 * Whether a cached module URL points at a different content hash than the manifest URL.
 * @param cachedUrl URL stored with GM cache
 * @param manifestUrl Current manifest-resolved URL
 * @param moduleFile Module file name
 */
export function isStaticModuleCacheStale(cachedUrl: string, manifestUrl: string | null | undefined, moduleFile: string): boolean {
  if (!manifestUrl?.trim() || !cachedUrl.trim()) {
    return false
  }
  const manifestHash = extractStaticModuleHash(manifestUrl, moduleFile)
  const cachedHash = extractStaticModuleHash(cachedUrl, moduleFile)
  if (!manifestHash || !cachedHash) {
    return false
  }
  return manifestHash !== cachedHash
}
