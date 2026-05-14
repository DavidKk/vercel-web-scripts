'use client'

import { useCallback, useEffect, useState } from 'react'
import { FiShield } from 'react-icons/fi'

import { loadSignetSdk } from '@/lib/load-signet-sdk'
import { getSignetSdkModuleUrl } from '@/lib/signet-sdk-url'
import { VF2FA_NEXT_COOKIE, VF2FA_OAUTH_STATE_COOKIE, VF2FA_REMEMBER_ME_COOKIE } from '@/services/auth/constants'

export interface Vercel2FALoginButtonProps {
  /** Auth center base URL (e.g. http://localhost:3000). Resolved with server via `getSignetAuthCenterOrigin()`. */
  authCenterOrigin: string
  /** App path for the OAuth callback (must be allowlisted on the auth center). */
  callbackPath?: string
  /** Relative path after login (e.g. /editor). Must start with `/` and must not be `//`. */
  postLoginPath?: string
  /** Whether the callback should create a longer session. */
  rememberMe?: boolean
}

const COOKIE_MAX_AGE_SEC = 600

/**
 * Redirect the browser to the Signet auth center `/login` flow (sets short-lived cookies for `state` and post-login path).
 */
export function Vercel2FALoginButton(props: Vercel2FALoginButtonProps) {
  const { authCenterOrigin, callbackPath = '/auth/vercel-2fa/callback', postLoginPath = '/editor', rememberMe = false } = props

  const sdkUrl = getSignetSdkModuleUrl()
  const [sdkError, setSdkError] = useState<string | null>(null)

  const ensureSdk = useCallback(async () => {
    return loadSignetSdk()
  }, [])

  useEffect(() => {
    void ensureSdk()
      .then(() => {
        setSdkError(null)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setSdkError(msg)
      })
  }, [ensureSdk])

  /**
   * Start redirect login: persist CSRF state + next path in cookies, then navigate to the auth center.
   */
  function handleClick() {
    void ensureSdk()
      .then((m) => {
        const state = crypto.randomUUID()
        const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'
        const cookieSuffix = `Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure ? '; Secure' : ''}`
        document.cookie = `${VF2FA_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieSuffix}`
        document.cookie = `${VF2FA_NEXT_COOKIE}=${encodeURIComponent(postLoginPath)}; ${cookieSuffix}`
        document.cookie = `${VF2FA_REMEMBER_ME_COOKIE}=${rememberMe ? '1' : '0'}; ${cookieSuffix}`

        const origin = window.location.origin
        const redirectUrl = `${origin}${callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`}`
        const url = m.buildLoginUrl({ authCenterOrigin: authCenterOrigin.replace(/\/+$/, ''), redirectUrl, state })
        window.location.href = url
      })
      .catch(() => {
        // `sdkError` set by prefetch effect when load fails
      })
  }

  return (
    <div className="w-full max-w-lg flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center justify-center gap-2 w-full max-w-lg bg-[#1f3b63] border border-[#31577f] text-[#e6eaf0] px-4 py-2.5 rounded hover:bg-[#274b78] hover:border-[#3b82f6] transition-colors"
      >
        <FiShield className="h-4 w-4" />
        <span className="font-medium">Continue with Signet</span>
      </button>
      {sdkError ? (
        <p className="text-xs text-red-400 text-center leading-relaxed">
          Could not load Signet SDK from <code className="text-[#cbd5e1]">{sdkUrl}</code>: {sdkError}
        </p>
      ) : null}
    </div>
  )
}
