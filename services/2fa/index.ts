import { createGuardrails, verify } from 'otplib'

export interface Verify2faParams {
  token: string
  secret: string
}

/**
 * otplib v13 enforces a 16-byte minimum secret by default; v12 did not.
 * Relax it so existing (shorter) ACCESS_2FA_SECRET values keep working.
 */
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 1 })

export async function verify2fa(params: Verify2faParams) {
  const { token, secret } = params

  try {
    const { valid } = await verify({ token, secret, guardrails })
    return valid
  } catch (error) {
    return false
  }
}
