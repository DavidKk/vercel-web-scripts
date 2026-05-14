'use client'

import { useRequest } from 'ahooks'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FiCheck, FiEye, FiEyeOff, FiGithub, FiLock, FiUser } from 'react-icons/fi'

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#111318] gap-4">
        <Spinner color="text-[#3b82f6]" />
        <p className="text-[#e6eaf0] text-sm">Validating third-party login...</p>
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
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
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
        body: JSON.stringify({ username, password, token: access2FAToken, rememberMe }),
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
  const inputClass =
    'mt-1 w-full px-3.5 py-2.5 bg-[#171a21] border border-[#2a303a] rounded text-[#e6eaf0] placeholder:text-[#6f7a8a] placeholder:tracking-normal text-base shadow-inner focus:ring-2 focus:ring-[#3b82f6]/30 focus:border-[#3b82f6] focus:outline-none transition-colors'
  const inputWithLeftIconClass =
    'mt-1 w-full pl-10 pr-3.5 py-2.5 bg-[#171a21] border border-[#2a303a] rounded text-[#e6eaf0] placeholder:text-[#6f7a8a] placeholder:tracking-normal text-base shadow-inner focus:ring-2 focus:ring-[#3b82f6]/30 focus:border-[#3b82f6] focus:outline-none transition-colors'
  const passwordInputClass =
    'mt-1 w-full pl-10 pr-10 py-2.5 bg-[#171a21] border border-[#2a303a] rounded text-[#e6eaf0] placeholder:text-[#6f7a8a] placeholder:tracking-normal text-base shadow-inner focus:ring-2 focus:ring-[#3b82f6]/30 focus:border-[#3b82f6] focus:outline-none transition-colors'

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#111318] px-4 py-8 text-[#e6eaf0]">
      {/* GitHub link in top right corner */}
      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 right-4 p-2 text-[#9aa4b2] hover:text-white hover:bg-[#1b1f27] rounded transition-colors"
          title="View on GitHub"
        >
          <FiGithub className="w-5 h-5" />
        </a>
      )}
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg border border-[#2a303a] bg-[#1b1f27] p-5 shadow-2xl shadow-black/30">
        <div className="mb-5 flex flex-col items-center gap-3">
          <Image src="/logo.png" alt="MagickMonkey logo" width={72} height={72} className="rounded-md" priority />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white">MagickMonkey</h1>
            <p className="mt-1 text-sm text-[#9aa4b2]">Sign in to open the script editor</p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="relative w-full">
            <FiUser className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f7a8a]" />
            <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" required className={inputWithLeftIconClass} />
          </div>

          <div className="relative w-full">
            <FiLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6f7a8a]" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              className={passwordInputClass}
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-2 top-1/2 rounded p-1 text-[#6f7a8a] -translate-y-1/2 transition-colors hover:bg-[#2a303a] hover:text-white"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
            </button>
          </div>

          {enable2FA && (
            <input
              value={access2FAToken}
              onChange={(event) => setAccess2FAToken(event.target.value)}
              placeholder="2FA Code"
              maxLength={6}
              pattern="\d{6}"
              required
              className={`${inputClass} text-center tracking-[1em]`}
            />
          )}

          <label className="flex w-full cursor-pointer select-none items-center gap-2 text-sm text-[#9aa4b2]">
            <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
              <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="peer sr-only" />
              <span className="absolute inset-0 rounded border border-[#2a303a] bg-[#171a21] transition-colors peer-checked:border-[#3b82f6] peer-checked:bg-[#3b82f6]" />
              <FiCheck className="relative h-3 w-3 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
            </span>
            <span>Remember me</span>
          </label>

          <button
            disabled={submitting || complete}
            type="submit"
            className="relative w-full bg-[#3b82f6] text-white px-4 py-2.5 rounded font-medium hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <div className="w-full border-t border-[#2a303a]"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-[#1b1f27] text-[#6f7a8a]">Or</span>
              </div>
            </div>
          </div>

          {vercel2FAOrigin ? (
            <Vercel2FALoginButton authCenterOrigin={vercel2FAOrigin} postLoginPath={redirectUrl} rememberMe={rememberMe} />
          ) : (
            <p className="text-xs text-[#6f7a8a] text-center max-w-lg leading-relaxed">
              Optional: set <code className="text-[#cbd5e1]">NEXT_PUBLIC_SIGNET_SDK_URL</code> to your hosted <code className="text-[#cbd5e1]">signet-client.mjs</code> (same-origin
              Signet); see <code className="text-[#cbd5e1]">.env.example</code>.
            </p>
          )}

          <Alert ref={alertRef} />
        </div>

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
