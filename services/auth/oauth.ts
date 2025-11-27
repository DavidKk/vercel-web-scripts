import { serialize } from 'cookie'
import jwt from 'jsonwebtoken'

import { generateToken } from '@/utils/jwt'

import { AUTH_TOKEN_NAME } from './constants'

const COOKIE_MAX_AGE = 24 * 60 * 60

interface ThirdPartyPayload extends jwt.JwtPayload {
  username?: string
  authenticated?: boolean
  [key: string]: unknown
}

export async function exchangeOAuthSession(token: string) {
  if (!token) {
    throw new Error('token is required')
  }

  const payload = verifyThirdPartyToken(token)
  const allowedUsername = getAllowedUsername()

  if (!payload.username || payload.username !== allowedUsername) {
    throw new Error('Third-party token does not match the configured ACCESS_USERNAME.')
  }

  if (!payload.authenticated) {
    throw new Error('Third-party token is not marked as authenticated.')
  }

  const username = payload.username

  const sessionToken = generateToken({
    authenticated: true,
    provider: 'oauth',
    username,
  })

  const cookie = serialize(AUTH_TOKEN_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })

  return {
    cookie,
    user: {
      username,
      provider: 'oauth',
    },
  }
}

function verifyThirdPartyToken(token: string): ThirdPartyPayload {
  const secret = getOAuthSecret()
  try {
    return jwt.verify(token, secret) as ThirdPartyPayload
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid oauth token')
  }
}

function getOAuthSecret() {
  const secret = process.env.OAUTH_JWT_SECRET || process.env.JWT_SECRET
  if (!secret) {
    throw new Error('OAUTH_JWT_SECRET or JWT_SECRET is required to verify third-party tokens.')
  }
  return secret
}

function getAllowedUsername() {
  const username = process.env.ACCESS_USERNAME
  if (!username) {
    throw new Error('ACCESS_USERNAME is required to validate third-party tokens.')
  }
  return username
}
