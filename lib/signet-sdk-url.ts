const DEFAULT_AUTH_CENTER_ORIGIN = 'https://vercel-2fa.vercel.app'

function getExplicitSignetSdkUrlFromEnv(): string | null {
  const v = process.env.SIGNET_SDK_URL?.trim()
  return v || null
}

/**
 * Signet auth center base URL (scheme + host, no trailing slash) for
 * `buildLoginUrl` / `verifyTokenAtAuthCenter`.
 *
 * When `SIGNET_SDK_URL` points at `…/signet-client.mjs`, returns that URL’s origin.
 * Otherwise returns `null` (Signet entry hidden until configured). In the browser,
 * `SIGNET_SDK_URL` is not exposed—this stays `null` on the client unless you pass
 * the origin from a Server Component.
 *
 * @returns Normalized origin, or `null` if unset or not a `signet-client.mjs` URL
 */
export function getSignetAuthCenterOrigin(): string | null {
  const sdkUrl = getExplicitSignetSdkUrlFromEnv()
  if (!sdkUrl) {
    return null
  }
  try {
    const u = new URL(sdkUrl)
    const path = u.pathname.replace(/\/+$/, '') || ''
    if (!path.endsWith('signet-client.mjs')) {
      return null
    }
    return u.origin
  } catch {
    return null
  }
}

function resolveAuthCenterBaseForSdkUrl(): string {
  return getSignetAuthCenterOrigin() || DEFAULT_AUTH_CENTER_ORIGIN
}

/**
 * Full URL of the hosted Signet SDK (`signet-client.mjs`).
 * Uses `SIGNET_SDK_URL` when set; otherwise `{default host}/sdk/signet-client.mjs`.
 * Client bundles cannot read `SIGNET_SDK_URL`—pass this string from a Server Component when it must match the server.
 *
 * @returns Absolute SDK module URL
 */
export function getSignetSdkModuleUrl(): string {
  const explicit = getExplicitSignetSdkUrlFromEnv()
  if (explicit) {
    return explicit
  }
  const base = resolveAuthCenterBaseForSdkUrl()
  return `${base}/sdk/signet-client.mjs`
}
