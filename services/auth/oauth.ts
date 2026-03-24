import { serialize } from 'cookie'

import { generateToken, type JWTPayload, verifyJwtWithSecret } from '@/utils/jwt'

import { AUTH_TOKEN_NAME } from './constants'

const COOKIE_MAX_AGE = 24 * 60 * 60

interface ThirdPartyPayload extends JWTPayload {
  username?: string
  authenticated?: boolean
  [key: string]: unknown
}

export async function exchangeOAuthSession(token: string) {
  if (!token) {
    throw new Error('token is required')
  }

  const payload = await verifyThirdPartyToken(token)
  const allowedUsername = getAllowedUsername()

  if (!payload.username || payload.username !== allowedUsername) {
    throw new Error('Third-party token does not match the configured ACCESS_USERNAME.')
  }

  if (!payload.authenticated) {
    throw new Error('Third-party token is not marked as authenticated.')
  }

  const username = payload.username

  const sessionToken = await generateToken({
    authenticated: true,
    provider: 'oauth',
    username,
    sub: username,
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

async function verifyThirdPartyToken(token: string): Promise<ThirdPartyPayload> {
  const secret = getOAuthSecret()
  try {
    const payload = await verifyJwtWithSecret(token, secret)
    if (!payload) {
      throw new Error('Invalid oauth token')
    }
    return payload as ThirdPartyPayload
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
