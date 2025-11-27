'use client'

import { useRequest } from 'ahooks'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { AlertImperativeHandler } from '@/components/Alert'
import Alert from '@/components/Alert'
import { Spinner } from '@/components/Spinner'
import { useOAuthLoginContext, withOAuthLogin } from '@/services/oauth-login/withOAuthLogin'

export interface LoginFormProps {
  enable2FA?: boolean
  redirectUrl?: string
}

function LoginForm(props: LoginFormProps) {
  const { enable2FA, redirectUrl = '/' } = props
  const oauth = useOAuthLoginContext()

  if (oauth.isHandlingCallback) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 gap-4">
        <Spinner />
        <p className="text-gray-600 text-sm">Validating third-party login...</p>
      </div>
    )
  }

  // const launchingOAuth = oauth.status === 'launching'
  // const redirectingOAuth = oauth.status === 'redirecting'
  // const oauthDisabled = !oauth.available || launchingOAuth || redirectingOAuth

  // const handleOAuthClick = () => {
  //   oauth.resetError()
  //   oauth.launch()
  // }

  // const oauthButtonLabel = (() => {
  //   if (!oauth.available) {
  //     return 'Third-party login is disabled'
  //   }
  //   if (launchingOAuth) {
  //     return 'Preparing secure handshake...'
  //   }
  //   if (redirectingOAuth) {
  //     return 'Redirecting to third-party login...'
  //   }
  //   return 'Vercel 2FA Login'
  // })()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [access2FAToken, setAccess2FAToken] = useState('')
  const [complete, setComplete] = useState(false)
  const alertRef = useRef<AlertImperativeHandler>(null)
  const router = useRouter()

  const { run: submit, loading: submitting } = useRequest(
    async () => {
      if (!username || !password) {
        throw new Error('Username and password are required')
      }

      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, token: access2FAToken }),
      })

      if (!response.ok) {
        throw new Error('Invalid username or password')
      }
    },
    {
      manual: true,
      throttleWait: 1000,
      onSuccess: () => {
        router.push(redirectUrl)
        setComplete(true)
      },
      onError: (error: Error) => {
        alertRef.current?.show(error.message, { type: 'error' })
      },
    }
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    submit()
  }

  useEffect(() => {
    if (username && password && access2FAToken) {
      submit()
    }
  }, [username, password, access2FAToken])

  return (
    <div className="flex justify-center pt-[20vh] h-screen bg-gray-100 pt-12">
      <form onSubmit={handleSubmit} className="w-full max-w-lg flex flex-col items-center gap-4 p-4">
        <h1 className="text-2xl">Login</h1>

        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          required
          className="mt-1 w-full px-3 py-2 border rounded-md placeholder:tracking-normal text-lg focus:ring-indigo-500 focus:border-indigo-500"
        />

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          className="mt-1 w-full px-3 py-2 border rounded-md placeholder:tracking-normal text-lg focus:ring-indigo-500 focus:border-indigo-500"
        />

        {enable2FA && (
          <input
            className="mt-1 w-full px-3 py-2 border rounded-md text-center tracking-[1em] placeholder:tracking-normal text-lg focus:ring-indigo-500 focus:border-indigo-500"
            value={access2FAToken}
            onChange={(event) => setAccess2FAToken(event.target.value)}
            placeholder="2FA Code"
            maxLength={6}
            pattern="\d{6}"
            required
          />
        )}

        <button
          disabled={submitting || complete}
          type="submit"
          className="relative w-full max-w-lg bg-indigo-500 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <div>
              <span className="w-6 h-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Spinner />
              </span>
              &nbsp;
            </div>
          ) : complete ? (
            <span>Redirecting to dashboard, please wait...</span>
          ) : (
            <span>Login</span>
          )}
        </button>

        <Alert ref={alertRef} />

        {/* {oauth.available && (
          <>
            <div className="text-center text-sm text-gray-500 w-full">- Or continue with a trusted vercel-2fa account -</div>
            <button
              type="button"
              onClick={handleOAuthClick}
              disabled={oauthDisabled}
              className="relative w-full max-w-lg border border-indigo-500 text-indigo-600 px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(launchingOAuth || redirectingOAuth) && (
                <span className="w-6 h-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Spinner />
                </span>
              )}
              <span className={launchingOAuth || redirectingOAuth ? 'opacity-60' : undefined}>{oauthButtonLabel}</span>
            </button>
            {oauth.error && <p className="text-sm text-red-500 text-center w-full">{oauth.error}</p>}
          </>
        )} */}
      </form>
    </div>
  )
}

export default withOAuthLogin(LoginForm)
