'use client'

import { useRequest } from 'ahooks'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FiGithub } from 'react-icons/fi'

import type { AlertImperativeHandler } from '@/components/Alert'
import Alert from '@/components/Alert'
import { Spinner } from '@/components/Spinner'
import { Vercel2FALoginButton } from '@/components/Vercel2FALoginButton'
import { repositoryUrl } from '@/config/package'
import { useOAuthLoginContext, withOAuthLogin } from '@/services/oauth-login/withOAuthLogin'

export interface LoginFormProps {
  enable2FA?: boolean
  redirectUrl?: string
  /** When set, shows “Continue with Signet” (auth center base URL; see `getSignetAuthCenterOrigin`). */
  vercel2FAOrigin?: string | null
}

function LoginForm(props: LoginFormProps) {
  const { enable2FA, redirectUrl = '/', vercel2FAOrigin } = props
  const oauth = useOAuthLoginContext()

  if (oauth.isHandlingCallback) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1e1e1e] gap-4">
        <Spinner />
        <p className="text-[#d4d4d4] text-sm">Validating third-party login...</p>
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const params = new URLSearchParams(window.location.search)
    const err = params.get('vf2fa_error')
    if (!err) {
      return
    }
    const message =
      err === 'missing_token'
        ? 'Signet login missing token. Try again.'
        : err === 'invalid_state'
          ? 'Signet login state check failed. Try signing in again.'
          : err === 'verify_failed'
            ? 'Could not verify login with the auth center. Check auth center origin env (see getSignetAuthCenterOrigin) and auth center logs.'
            : `Signet login error: ${err}`
    alertRef.current?.show(message, { type: 'error' })
    params.delete('vf2fa_error')
    const qs = params.toString()
    const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', path)
  }, [])

  const githubUrl = repositoryUrl || 'https://github.com/DavidKk/vercel-web-scripts'

  return (
    <div className="relative flex justify-center items-center h-screen bg-[#1e1e1e]">
      {/* GitHub link in top right corner */}
      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 right-4 p-2 text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] rounded transition-colors"
          title="View on GitHub"
        >
          <FiGithub className="w-5 h-5" />
        </a>
      )}
      <form onSubmit={handleSubmit} className="w-full max-w-lg flex flex-col items-center gap-4 p-4">
        <h1 className="text-2xl text-white">Login</h1>

        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          required
          className="mt-1 w-full px-3 py-2 bg-[#252526] border border-[#2d2d2d] rounded text-[#d4d4d4] placeholder:text-[#858585] placeholder:tracking-normal text-lg focus:ring-[#0e639c] focus:border-[#0e639c] focus:outline-none"
        />

        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          required
          className="mt-1 w-full px-3 py-2 bg-[#252526] border border-[#2d2d2d] rounded text-[#d4d4d4] placeholder:text-[#858585] placeholder:tracking-normal text-lg focus:ring-[#0e639c] focus:border-[#0e639c] focus:outline-none"
        />

        {enable2FA && (
          <input
            className="mt-1 w-full px-3 py-2 bg-[#252526] border border-[#2d2d2d] rounded text-center tracking-[1em] text-[#d4d4d4] placeholder:text-[#858585] placeholder:tracking-normal text-lg focus:ring-[#0e639c] focus:border-[#0e639c] focus:outline-none"
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
          className="relative w-full max-w-lg bg-[#0e639c] text-white px-4 py-2 rounded hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

        <div className="w-full max-w-lg">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#2d2d2d]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#1e1e1e] text-[#858585]">Or</span>
            </div>
          </div>
        </div>

        {vercel2FAOrigin ? (
          <Vercel2FALoginButton authCenterOrigin={vercel2FAOrigin} postLoginPath={redirectUrl} />
        ) : (
          <p className="text-xs text-[#858585] text-center max-w-lg leading-relaxed">
            Optional: set <code className="text-[#cccccc]">NEXT_PUBLIC_SIGNET_SDK_URL</code> to your hosted <code className="text-[#cccccc]">signet-client.mjs</code> (same-origin
            Signet); see <code className="text-[#cccccc]">.env.example</code>.
          </p>
        )}

        <a
          href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDavidKk%2Fvercel-web-scripts"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full max-w-lg bg-[#252526] border border-[#2d2d2d] text-[#cccccc] px-4 py-2 rounded hover:bg-[#2d2d2d] hover:border-[#3e3e42] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 76 65" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="white" />
          </svg>
          <span>Deploy to Vercel</span>
        </a>

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
