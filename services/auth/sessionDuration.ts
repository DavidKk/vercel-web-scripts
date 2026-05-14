import { parseExpirationSeconds } from '@/utils/jwt'

export const DEFAULT_SESSION_MAX_AGE = 24 * 60 * 60

export function getRememberedSessionMaxAge(): number {
  return parseExpirationSeconds(process.env.JWT_EXPIRES_IN || '1d')
}

export function getSessionMaxAge(rememberMe: boolean): number {
  return rememberMe ? getRememberedSessionMaxAge() : DEFAULT_SESSION_MAX_AGE
}
