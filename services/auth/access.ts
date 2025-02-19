import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/utils/jwt'
import { isApiRouter } from '@/utils/env'
import { AUTH_TOKEN_NAME } from './constants'

export interface CheckAccessOptions {
  redirectUrl?: string
  checkApiRouter?: boolean
}

export async function validateCookie() {
  const cookieStore = await cookies()
  const authInfo = cookieStore.get(AUTH_TOKEN_NAME)
  if (!authInfo) {
    return false
  }

  const token = authInfo.value
  const user = token ? verifyToken(token) : null
  if (!user) {
    return false
  }

  return true
}

export async function checkAccess(options?: CheckAccessOptions) {
  const { redirectUrl = '/login', checkApiRouter = true } = options || {}
  if (await validateCookie()) {
    return true
  }

  if (checkApiRouter && (await isApiRouter())) {
    return false
  }

  redirect(redirectUrl)
}

export interface CheckUnAccessOptions {
  redirectUrl?: string
}

export async function checkUnAccess(options?: CheckUnAccessOptions) {
  const { redirectUrl = '/' } = options || {}

  if (!(await validateCookie())) {
    return true
  }

  if (await isApiRouter()) {
    return false
  }

  redirect(redirectUrl)
}
