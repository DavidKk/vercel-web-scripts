import { api } from '@/initializer/controller'
import { jsonInvalidParameters, jsonSuccess } from '@/initializer/response'
import { exchangeOAuthSession } from '@/services/auth/oauth'

export const POST = api(async (req) => {
  const { token } = await req.json()

  if (!token || typeof token !== 'string') {
    return jsonInvalidParameters('token is required')
  }

  const { cookie, user } = await exchangeOAuthSession(token)
  const headers = new Headers()
  headers.append('Set-Cookie', cookie)

  return jsonSuccess({ user }, { headers })
})
