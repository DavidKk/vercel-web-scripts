'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { OAuthStatus } from './constants'
import { OAUTH_CALLBACK_PARAMS, OAUTH_LOGIN_URL, OAUTH_SERVER_PUBLIC_KEY } from './constants'
import { decryptOAuthPayload } from './decryptToken'
import { exportPrivateKey, exportPublicKey, generateECDHKeyPair } from './ecdh'
import { clearOAuthSession, persistOAuthSession, readOAuthSession } from './session'

export interface UseOAuthLoginOptions {
  redirectUrl?: string
}

export interface UseOAuthLoginResult {
  status: OAuthStatus
  error: string | null
  launch: () => Promise<void>
  resetError: () => void
  isHandlingCallback: boolean
  available: boolean
}

export function useOAuthLogin(options: UseOAuthLoginOptions = {}): UseOAuthLoginResult {
  const { redirectUrl = '/' } = options
  const isConfigReady = Boolean(OAUTH_SERVER_PUBLIC_KEY)
  const initialError = isConfigReady ? null : 'NEXT_PUBLIC_OAUTH_SERVER_PUBLIC_KEY is not configured. Third-party login is disabled.'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<OAuthStatus>(isConfigReady ? 'idle' : 'error')
  const [error, setError] = useState<string | null>(initialError)
  const processingRef = useRef(false)

  const tokenFromUrl = searchParams?.get(OAUTH_CALLBACK_PARAMS.token) ?? ''
  const stateFromUrl = searchParams?.get(OAUTH_CALLBACK_PARAMS.state) ?? ''

  const stripOAuthParams = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete(OAUTH_CALLBACK_PARAMS.token)
    url.searchParams.delete(OAUTH_CALLBACK_PARAMS.state)
    window.history.replaceState(window.history.state, '', url.toString())
  }, [])

  useEffect(() => {
    if (!isConfigReady && typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[OAuthLogin] Third-party login disabled: missing NEXT_PUBLIC_OAUTH_SERVER_PUBLIC_KEY')
    }
  }, [isConfigReady])

  const launch = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    if (!isConfigReady) {
      setStatus('error')
      setError('Third-party login is not configured.')
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.warn('[OAuthLogin] Aborted launch: NEXT_PUBLIC_OAUTH_SERVER_PUBLIC_KEY is missing')
      }
      return
    }

    setError(null)
    setStatus('launching')

    try {
      const keyPair = await generateECDHKeyPair()
      const [clientPublicKey, clientPrivateKey] = await Promise.all([exportPublicKey(keyPair), exportPrivateKey(keyPair)])
      const state = crypto.randomUUID()

      persistOAuthSession({ state, clientPublicKey, clientPrivateKey })

      const callbackUrl = buildCallbackUrl()
      const loginUrl = new URL(OAUTH_LOGIN_URL)
      loginUrl.searchParams.set('redirectUrl', encodeURIComponent(callbackUrl))
      loginUrl.searchParams.set('state', state)
      loginUrl.searchParams.set('clientPublicKey', clientPublicKey)

      setStatus('redirecting')
      window.location.href = loginUrl.toString()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to start third-party login.')
    }
  }, [isConfigReady])

  useEffect(() => {
    if (typeof window === 'undefined' || !tokenFromUrl || processingRef.current) {
      return
    }

    processingRef.current = true
    setStatus('processing')
    setError(null)

    const handleCallback = async () => {
      try {
        const session = readOAuthSession()
        if (!session) {
          throw new Error('OAuth session expired. Please launch login again.')
        }

        if (!stateFromUrl) {
          throw new Error('Callback is missing the state parameter.')
        }

        if (stateFromUrl !== session.state) {
          throw new Error('State check failed. Please launch login again.')
        }

        const payload = await decryptOAuthPayload(tokenFromUrl, session.clientPrivateKey)
        await exchangeOAuthToken(payload.token)

        clearOAuthSession()
        stripOAuthParams()
        setStatus('success')
        router.push(redirectUrl)
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Third-party login failed. Please try again later.')
        clearOAuthSession()
        stripOAuthParams()
      } finally {
        processingRef.current = false
      }
    }

    handleCallback()
  }, [redirectUrl, router, stateFromUrl, stripOAuthParams, tokenFromUrl])

  const resetError = useCallback(() => setError(null), [])

  const isHandlingCallback = useMemo(() => status === 'processing' || status === 'success', [status])

  return {
    status,
    error,
    launch,
    resetError,
    isHandlingCallback,
    available: isConfigReady,
  }
}

async function exchangeOAuthToken(token: string) {
  const response = await fetch('/api/auth/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

  const result = await response.json()
  if (!response.ok || !result || typeof result !== 'object') {
    throw new Error('Server failed to handle the third-party login.')
  }

  if (result.code !== 0) {
    throw new Error(result.message || 'Server failed to handle the third-party login.')
  }

  return result.data
}

function buildCallbackUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete(OAUTH_CALLBACK_PARAMS.token)
  url.searchParams.delete(OAUTH_CALLBACK_PARAMS.state)
  const sanitizedSearch = url.searchParams.toString()
  return sanitizedSearch ? `${url.origin}${url.pathname}?${sanitizedSearch}` : `${url.origin}${url.pathname}`
}
