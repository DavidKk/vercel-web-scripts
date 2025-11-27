export const OAUTH_LOGIN_URL = process.env.NEXT_PUBLIC_OAUTH_LOGIN_URL || 'https://vercel-2fa.vercel.app/oauth'

export const OAUTH_STORAGE_KEYS = {
  state: 'oauth_state',
  clientPublicKey: 'oauth_client_public_key',
  clientPrivateKey: 'oauth_client_private_key',
} as const

export const OAUTH_CALLBACK_PARAMS = {
  token: 'token',
  state: 'state',
} as const

export const OAUTH_SERVER_PUBLIC_KEY = process.env.NEXT_PUBLIC_OAUTH_SERVER_PUBLIC_KEY || ''

export type OAuthStatus = 'idle' | 'launching' | 'redirecting' | 'processing' | 'success' | 'error'
