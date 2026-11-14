import { stringifySetCookie } from 'cookie'

import { api } from '@/initializer/controller'
import { jsonSuccess } from '@/initializer/response'
import { AUTH_TOKEN_NAME } from '@/services/auth/constants'

/**
 * Logout API endpoint
 * Clears the authentication cookie
 */
export const POST = api(async () => {
  const cookie = stringifySetCookie({ name: AUTH_TOKEN_NAME, value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 0, path: '/' })

  const headers = new Headers()
  headers.append('Set-Cookie', cookie)

  return jsonSuccess(null, { headers })
})
