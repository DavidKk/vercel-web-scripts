import { cookies } from 'next/headers'

import { api } from '@/initializer/controller'
import { jsonSuccess, jsonUnauthorized } from '@/initializer/response'
import { validateCookie } from '@/services/auth/access'
import { AUTH_TOKEN_NAME } from '@/services/auth/constants'
import { verifyToken } from '@/utils/jwt'

/**
 * GET /api/auth/me — display name for the signed-in admin (JWT `sub` or ACCESS_USERNAME).
 */
export const GET = api(async () => {
  if (!(await validateCookie())) {
    return jsonUnauthorized()
  }

  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_TOKEN_NAME)?.value
  const payload = token ? await verifyToken(token) : null
  const fromJwt = typeof payload?.sub === 'string' ? payload.sub : typeof payload?.username === 'string' ? payload.username : null
  const username = fromJwt || process.env.ACCESS_USERNAME || 'Admin'

  return jsonSuccess({ username })
})
