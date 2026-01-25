import { serialize } from 'cookie'

import { api } from '@/initializer/controller'
import { jsonSuccess } from '@/initializer/response'
import { AUTH_TOKEN_NAME } from '@/services/auth/constants'

/**
 * Logout API endpoint
 * Clears the authentication cookie
 */
export const POST = api(async () => {
  const cookie = serialize(AUTH_TOKEN_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })

  const headers = new Headers()
  headers.append('Set-Cookie', cookie)

  return jsonSuccess(null, { headers })
})
