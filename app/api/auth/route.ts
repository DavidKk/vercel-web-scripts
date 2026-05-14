import { api } from '@/initializer/controller'
import { jsonSuccess } from '@/initializer/response'

import { login } from './login'

export const POST = api(async (req) => {
  const { username, password, token, rememberMe } = await req.json()
  const { cookie } = await login(username, password, token, rememberMe === true)

  const headers = new Headers()
  headers.append('Set-Cookie', cookie)

  return jsonSuccess(null, { headers })
})
