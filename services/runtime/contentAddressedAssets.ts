/**
 * Helpers for content-addressed static scripts, CDN cache headers, and path-shaped URLs
 * (`/static/[key]/[hash]/file.js` where the middle segment is SHA-1 or `pending`) for edge KV / LRU keys.
 */

/** Path segment when build hash is not yet available (must-revalidate; optional `?h=` once hash known). */
export const PENDING_SEGMENT = 'pending'

/** Long-lived browser + edge cache when URL is content-addressed (path or valid `?h=`). */
export const CONTENT_ADDRESSED_CACHE_CONTROL = 'public, max-age=31536000, immutable, s-maxage=31536000'

/** Default for unversioned URLs: must revalidate with ETag / manifest. */
export const REVALIDATE_CACHE_CONTROL = 'public, max-age=0, must-revalidate'

/** Preset / preset-ui artifacts use SHA-1 hex from build manifests (40 chars). */
const SHA1_HEX_LENGTH = 40

/**
 * True if string looks like a SHA-1 hex digest (safe path segment for `[hash]` routes).
 * @param s Candidate hash segment
 * @returns Whether format is valid
 */
export function isSha1ContentHash(s: string): boolean {
  return typeof s === 'string' && s.length === SHA1_HEX_LENGTH && /^[a-f0-9]+$/i.test(s)
}

/**
 * Build module URL under `/static/{key}/{hashOrPending}/{file}` (content SHA-1 or `pending`).
 * @param baseUrl Origin (no trailing slash)
 * @param scriptKey Tampermonkey script key (same as other `/static/[key]/` routes)
 * @param file Bundle filename
 * @param hash Content SHA-1 from disk manifest or null
 * @returns Absolute URL
 */
export function buildVersionedStaticModuleUrl(
  baseUrl: string,
  scriptKey: string,
  file: 'preset.js' | 'preset-ui.js' | 'tampermonkey-remote.js',
  hash: string | null | undefined
): string {
  if (!hash || !isSha1ContentHash(hash)) {
    if (file === 'tampermonkey-remote.js') {
      return `${baseUrl}/static/${encodeURIComponent(scriptKey)}/tampermonkey-remote.js`
    }
    return `${baseUrl}/static/${encodeURIComponent(scriptKey)}/${PENDING_SEGMENT}/${file}`
  }
  return `${baseUrl}/static/${encodeURIComponent(scriptKey)}/${encodeURIComponent(hash)}/${file}`
}

/**
 * Whether the request `h` query matches the currently deployed artifact hash (safe for immutable caching).
 * @param hParam Raw `h` query value
 * @param currentHash Hash from disk manifest (current build)
 * @returns True when URL is content-addressed for this revision
 */
export function isContentAddressedMatch(hParam: string | null, currentHash: string | null | undefined): boolean {
  return Boolean(hParam && currentHash && hParam === currentHash)
}
