import { timingSafeEqual } from 'node:crypto'

import type { NextRequest } from 'next/server'

import { validateCookie } from '@/services/auth/access'

/**
 * Parse MCP headers from env SCRIPTS_MCP_HEADERS.
 */
export function getConfiguredMCPHeaders(): Record<string, string> {
  const rawHeaders = process.env.SCRIPTS_MCP_HEADERS?.trim()
  if (rawHeaders) {
    try {
      const parsed = JSON.parse(rawHeaders) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const normalized = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
          if (typeof value === 'string') {
            const headerKey = key.trim()
            const headerValue = value.trim()
            if (headerKey && headerValue) {
              acc[headerKey] = headerValue
            }
          }
          return acc
        }, {})
        if (Object.keys(normalized).length > 0) {
          return normalized
        }
      }
    } catch {
      // Ignore invalid JSON and treat as unconfigured.
    }
  }

  return {}
}

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
 * Authorize script integration routes (REST v1, MCP): session cookie or x-api-key.
 * @param req Incoming Next.js request
 * @returns True when the caller may use script CRUD integration APIs
 */
export async function authorizeScriptIntegration(req: NextRequest): Promise<boolean> {
  if (await validateCookie()) {
    return true
  }

  const configuredHeaders = getConfiguredMCPHeaders()
  const configuredApiKey = Object.entries(configuredHeaders).find(([headerName]) => headerName.toLowerCase() === 'x-api-key')?.[1]
  if (!configuredApiKey) {
    return false
  }

  const headerKey = req.headers.get('x-api-key')?.trim() ?? ''
  if (!headerKey) {
    return false
  }

  return timingSafeStringEqual(headerKey, configuredApiKey)
}
