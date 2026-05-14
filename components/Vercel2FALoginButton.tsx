'use client'

import { useCallback, useEffect, useState } from 'react'

import { loadSignetSdk } from '@/lib/load-signet-sdk'
import { getSignetSdkModuleUrl } from '@/lib/signet-sdk-url'
import { VF2FA_NEXT_COOKIE, VF2FA_OAUTH_STATE_COOKIE } from '@/services/auth/constants'

export interface Vercel2FALoginButtonProps {
  /** Auth center base URL (e.g. http://localhost:3000). Resolved with server via `getSignetAuthCenterOrigin()`. */
  authCenterOrigin: string
  /** App path for the OAuth callback (must be allowlisted on the auth center). */
  callbackPath?: string
  /** Relative path after login (e.g. /editor). Must start with `/` and must not be `//`. */
  postLoginPath?: string
}

const COOKIE_MAX_AGE_SEC = 600

/**
 * Redirect the browser to the unified Vercel 2FA `/login` flow (sets short-lived cookies for `state` and post-login path).
 */
export function Vercel2FALoginButton(props: Vercel2FALoginButtonProps) {
  const { authCenterOrigin, callbackPath = '/auth/vercel-2fa/callback', postLoginPath = '/editor' } = props

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
        className="flex items-center justify-center gap-2 w-full max-w-lg bg-[#1e3a5f] border border-[#2b5278] text-[#e0e8f0] px-4 py-2 rounded hover:bg-[#254a73] hover:border-[#3d6a9a] transition-colors"
      >
        <span className="font-medium">Sign in with Vercel 2FA</span>
      </button>
      {sdkError ? (
        <p className="text-xs text-red-400 text-center leading-relaxed">
          Could not load Signet SDK from <code className="text-[#cccccc]">{sdkUrl}</code>: {sdkError}
        </p>
      ) : null}
    </div>
  )
}
