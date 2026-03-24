import type { NextRequest } from 'next/server'

import { createMCPHttpServer } from '@/initializer/mcp/creator'
import { jsonUnauthorized } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'
import { buildScriptMcpToolsMap } from '@/services/scripts/scriptMcpTools'

const { manifest } = createMCPHttpServer('vercel-web-scripts-scripts', '1.0.0', 'Git-backed Tampermonkey script file tools (list, get, upsert, delete).', buildScriptMcpToolsMap())

/**
 * GET /api/mcp/scripts/manifest — MCP tool manifest (same auth as /api/v1/scripts).
 */
export async function GET(req: NextRequest, context: { params: Promise<Record<string, string>> }) {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }
  return manifest(req, context)
}
