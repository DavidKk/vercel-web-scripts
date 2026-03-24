import { timingSafeEqual } from 'node:crypto'

import type { NextRequest } from 'next/server'

import { validateCookie } from '@/services/auth/access'

/**
 * Compare two strings in constant time to reduce timing leaks on API keys.
 * @param a First secret string
 * @param b Second secret string
 * @returns True when lengths match and bytes are equal
 */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) {
    return false
  }
  return timingSafeEqual(ba, bb)
}

/**
 * Authorize script integration routes (REST v1, MCP): session cookie or SCRIPTS_API_KEY.
 * @param req Incoming Next.js request
 * @returns True when the caller may use script CRUD integration APIs
 */
export async function authorizeScriptIntegration(req: NextRequest): Promise<boolean> {
  if (await validateCookie()) {
    return true
  }

  const configured = process.env.SCRIPTS_API_KEY
  if (!configured || configured.length === 0) {
    return false
  }

  const auth = req.headers.get('authorization')
  const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  const headerKey = req.headers.get('x-api-key')?.trim() ?? ''
  const candidate = bearer || headerKey
  if (!candidate) {
    return false
  }

  return timingSafeStringEqual(candidate, configured)
}
