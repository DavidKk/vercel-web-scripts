const DEFAULT_AUTH_CENTER_ORIGIN = 'https://vercel-2fa.vercel.app'

/**
 * Signet auth center base URL (scheme + host, no path, no trailing slash) for
 * `buildLoginUrl` / `verifyTokenAtAuthCenter`.
 *
 * Resolution order:
 * 1. `VERCEL_2FA_ORIGIN`
 * 2. `NEXT_PUBLIC_VERCEL_2FA_ORIGIN`
 * 3. If `NEXT_PUBLIC_SIGNET_SDK_URL` points at `…/signet-client.mjs` on some host, use that URL's **origin**
 *    (typical when SDK is served from the same deployment as `/api/auth/verify`). If the `.mjs` is on a **CDN
 *    that is not your Signet API host**, you must still set (1) or (2).
 */
export function getSignetAuthCenterOrigin(): string | null {
  const fromServer = process.env.VERCEL_2FA_ORIGIN?.trim().replace(/\/+$/, '')
  if (fromServer) {
    return fromServer
  }
  const fromPublic = process.env.NEXT_PUBLIC_VERCEL_2FA_ORIGIN?.trim().replace(/\/+$/, '')
  if (fromPublic) {
    return fromPublic
  }
  const sdkUrl = process.env.NEXT_PUBLIC_SIGNET_SDK_URL?.trim()
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
 * Prefer `NEXT_PUBLIC_SIGNET_SDK_URL` for a CDN or custom path.
 * Otherwise `{getSignetAuthCenterOrigin() or default}/sdk/signet-client.mjs`.
 */
export function getSignetSdkModuleUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SIGNET_SDK_URL?.trim()
  if (explicit) {
    return explicit
  }
  const base = resolveAuthCenterBaseForSdkUrl()
  return `${base}/sdk/signet-client.mjs`
}
