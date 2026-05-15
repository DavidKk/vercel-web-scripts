import { serialize } from 'cookie'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { loadSignetSdk } from '@/lib/load-signet-sdk'
import { getSignetAuthCenterOrigin, getSignetSdkModuleUrl } from '@/lib/signet-sdk-url'
import { AUTH_TOKEN_NAME, VF2FA_NEXT_COOKIE, VF2FA_OAUTH_STATE_COOKIE, VF2FA_REMEMBER_ME_COOKIE } from '@/services/auth/constants'
import { getSessionMaxAge } from '@/services/auth/sessionDuration'
import { generateToken } from '@/utils/jwt'

/**
 * Decode cookie-stored next path and reject open redirects.
 * @param raw - Raw cookie value (may be URI-encoded).
 * @param fallback - Path when invalid or missing.
 * @returns Safe internal path starting with `/`.
 */
function safeRelativePath(raw: string | undefined, fallback: string): string {
  if (!raw || typeof raw !== 'string') {
    return fallback
  }
  let path = raw
  try {
    path = decodeURIComponent(raw)
  } catch {
    path = raw
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return fallback
  }
  return path
}

/**
 * Demo callback for unified login from a Vercel 2FA deployment.
 * Register this URL in the auth center `ALLOWED_REDIRECT_URLS`, e.g.
 * `http://localhost:3001/auth/vercel-2fa/callback`.
 *
 * Flow: validates `state` cookie, validates the short-lived login JWT via `POST /api/auth/verify`, then mints a local session JWT.
 */
export async function GET(request: Request) {
  const authCenterOrigin = getSignetAuthCenterOrigin()
  if (!authCenterOrigin) {
    return new NextResponse('Signet origin not configured: set SIGNET_SDK_URL to your hosted …/signet-client.mjs (same host as the verify API). Restart dev server.', {
      status: 503,
    })
  }

  const signet = await loadSignetSdk(getSignetSdkModuleUrl())
  const url = new URL(request.url)
  const { token, state } = signet.parseLoginCallbackParams(url.searchParams)

  const cookieStore = await cookies()
  const expectedState = cookieStore.get(VF2FA_OAUTH_STATE_COOKIE)?.value
  const nextRaw = cookieStore.get(VF2FA_NEXT_COOKIE)?.value
  const rememberMe = cookieStore.get(VF2FA_REMEMBER_ME_COOKIE)?.value === '1'

  /** Append clearing cookies for VF2FA flow (non-httpOnly mirrors client-set cookies). */
  function appendClearVF2FACookies(headers: Headers) {
    headers.append('Set-Cookie', serialize(VF2FA_OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 }))
    headers.append('Set-Cookie', serialize(VF2FA_NEXT_COOKIE, '', { path: '/', maxAge: 0 }))
    headers.append('Set-Cookie', serialize(VF2FA_REMEMBER_ME_COOKIE, '', { path: '/', maxAge: 0 }))
  }

  if (!state || !expectedState || state !== expectedState) {
    const target = new URL('/', url.origin)
    target.searchParams.set('vf2fa_error', 'invalid_state')
    const headers = new Headers()
    appendClearVF2FACookies(headers)
    return NextResponse.redirect(target, { headers })
  }

  if (!token) {
    const target = new URL('/', url.origin)
    target.searchParams.set('vf2fa_error', 'missing_token')
    const headers = new Headers()
    appendClearVF2FACookies(headers)
    return NextResponse.redirect(target, { headers })
  }

  const verified = await signet.verifyTokenAtAuthCenter({ authCenterOrigin, token })

  if (!verified.ok || !verified.response) {
    const target = new URL('/', url.origin)
    target.searchParams.set('vf2fa_error', 'verify_failed')
    const headers = new Headers()
    appendClearVF2FACookies(headers)
    return NextResponse.redirect(target, { headers })
  }

  const envelope = verified.response as Record<string, unknown>
  const data = envelope.data as Record<string, unknown> | undefined
  const user = data?.user as Record<string, unknown> | undefined
  const claimsFromApi = data?.claims as Record<string, unknown> | undefined
  const sub = typeof user?.sub === 'string' ? user.sub : 'vf2fa'

  const displayUsername =
    (typeof user?.username === 'string' && user.username.trim()) ||
    (typeof claimsFromApi?.preferred_username === 'string' && claimsFromApi.preferred_username.trim()) ||
    (typeof claimsFromApi?.username === 'string' && claimsFromApi.username.trim()) ||
    undefined
  const displayEmail = (typeof user?.email === 'string' && user.email.trim()) || (typeof claimsFromApi?.email === 'string' && claimsFromApi.email.trim()) || undefined

  const sessionPayload: Record<string, unknown> = {
    authenticated: true,
    sub,
  }
  if (displayUsername) {
    sessionPayload.username = displayUsername
    sessionPayload.preferred_username = displayUsername
  }
  if (displayEmail) {
    sessionPayload.email = displayEmail
  }

  const maxAge = getSessionMaxAge(rememberMe)
  const authToken = await generateToken(sessionPayload, { expiresIn: maxAge })
  const authCookie = serialize(AUTH_TOKEN_NAME, authToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge,
    path: '/',
  })

  const nextPath = safeRelativePath(nextRaw, '/editor')
  const target = new URL(nextPath, url.origin)

  const headers = new Headers()
  appendClearVF2FACookies(headers)
  headers.append('Set-Cookie', authCookie)

  return NextResponse.redirect(target, { headers })
}
