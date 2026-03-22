import { createHmac, timingSafeEqual } from 'node:crypto'

/** Standard JWT body shape (custom claims allowed). */
export type JWTPayload = Record<string, unknown>

/**
 * Parse JWT_EXPIRES_IN-style value to seconds from now.
 * @param exp - Numeric seconds, digits-only string (seconds), or e.g. 1d / 12h / 30m / 60s
 */
function parseExpirationSeconds(exp: string | number): number {
  if (typeof exp === 'number' && Number.isFinite(exp)) {
    return Math.max(1, Math.floor(exp))
  }
  const raw = String(exp).trim()
  if (/^\d+$/.test(raw)) {
    return Math.max(1, parseInt(raw, 10))
  }
  const m = raw.match(/^(\d+)\s*([smhd])$/i)
  if (m) {
    const n = parseInt(m[1], 10)
    const mult = { s: 1, m: 60, h: 3600, d: 86400 } as const
    const u = m[2].toLowerCase() as keyof typeof mult
    return Math.max(1, n * (mult[u] ?? 86400))
  }
  return 86400
}

function signHs256Jwt(header: object, payload: object, secret: Uint8Array): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url')
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${h}.${p}`
  const sig = createHmac('sha256', Buffer.from(secret)).update(data, 'utf8').digest('base64url')
  return `${data}.${sig}`
}

function verifyHs256Jwt(token: string, secretKey: Uint8Array): JWTPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    const [a, b, c] = parts
    if (!a || !b || !c) {
      return null
    }
    const data = `${a}.${b}`
    const expectedSig = createHmac('sha256', Buffer.from(secretKey)).update(data, 'utf8').digest('base64url')
    const sigBuf = Buffer.from(c, 'base64url')
    const expBuf = Buffer.from(expectedSig, 'base64url')
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null
    }
    const payloadJson = Buffer.from(b, 'base64url').toString('utf8')
    const payload = JSON.parse(payloadJson) as JWTPayload
    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp === 'number' && payload.exp < now) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function generateToken(payload: object): Promise<string> {
  const { secretKey, JWT_EXPIRES_IN } = getJWTConfigWithKey()
  const expiresIn = /^\d+$/.test(JWT_EXPIRES_IN) ? Number(JWT_EXPIRES_IN) : JWT_EXPIRES_IN
  const seconds = parseExpirationSeconds(expiresIn)
  const now = Math.floor(Date.now() / 1000)
  const body: Record<string, unknown> = {
    ...(payload as Record<string, unknown>),
    iat: now,
    exp: now + seconds,
  }
  return signHs256Jwt({ alg: 'HS256', typ: 'JWT' }, body, secretKey)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  return verifyHs256Jwt(token, getJWTSecretKey())
}

/**
 * Verify HS256 JWT with an arbitrary secret (e.g. OAuth third-party token).
 * @param token - Raw JWT string
 * @param secret - Same secret used to sign the token
 */
export async function verifyJwtWithSecret(token: string, secret: string): Promise<JWTPayload | null> {
  return verifyHs256Jwt(token, new TextEncoder().encode(secret))
}

function getJWTConfig(): { JWT_SECRET: string; JWT_EXPIRES_IN: string } {
  const JWT_SECRET = process.env.JWT_SECRET
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d'

  if (!JWT_SECRET) {
    throw new Error('process.env.JWT_SECRET is not defined')
  }

  return {
    JWT_SECRET: JWT_SECRET as string,
    JWT_EXPIRES_IN,
  }
}

function getJWTSecretKey(): Uint8Array {
  const { JWT_SECRET } = getJWTConfig()
  return new TextEncoder().encode(JWT_SECRET)
}

function getJWTConfigWithKey(): { secretKey: Uint8Array; JWT_EXPIRES_IN: string } {
  const { JWT_SECRET, JWT_EXPIRES_IN } = getJWTConfig()
  const secretKey = new TextEncoder().encode(JWT_SECRET)

  return {
    secretKey,
    JWT_EXPIRES_IN,
  }
}
