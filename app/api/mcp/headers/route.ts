import { api } from '@/initializer/controller'
import { jsonSuccess, jsonUnauthorized } from '@/initializer/response'
import { validateCookie } from '@/services/auth/access'
import { getConfiguredMCPHeaders } from '@/services/auth/integrationAuth'

interface MCPHeadersPayload {
  endpoint: string
  headers: Record<string, string>
}

/**
 * GET /api/mcp/headers - return MCP endpoint and auth headers for signed-in users.
 */
export const GET = api(async (req) => {
  if (!(await validateCookie())) {
    return jsonUnauthorized()
  }

  return jsonSuccess({
    endpoint: `${req.nextUrl.origin}/api/mcp`,
    headers: getConfiguredMCPHeaders(),
  } satisfies MCPHeadersPayload)
})
