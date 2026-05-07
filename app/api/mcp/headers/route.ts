import { api } from '@/initializer/controller'
import { jsonSuccess, jsonUnauthorized } from '@/initializer/response'
import { validateCookie } from '@/services/auth/access'

interface MCPHeadersPayload {
  endpoint: string
  headers: {
    'x-api-key': string
    Authorization: string
  }
}

/**
 * GET /api/mcp/headers - return MCP endpoint and auth headers for signed-in users.
 */
export const GET = api(async (req) => {
  if (!(await validateCookie())) {
    return jsonUnauthorized()
  }

  const apiKey = process.env.SCRIPTS_API_KEY?.trim()
  if (!apiKey) {
    return jsonSuccess({
      endpoint: `${req.nextUrl.origin}/api/mcp`,
      headers: {
        'x-api-key': '',
        Authorization: '',
      },
    } satisfies MCPHeadersPayload)
  }

  return jsonSuccess({
    endpoint: `${req.nextUrl.origin}/api/mcp`,
    headers: {
      'x-api-key': apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
  } satisfies MCPHeadersPayload)
})
