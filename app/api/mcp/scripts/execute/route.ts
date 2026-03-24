import type { NextRequest } from 'next/server'

import { createMCPHttpServer } from '@/initializer/mcp/creator'
import { jsonUnauthorized } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'
import { buildScriptMcpToolsMap } from '@/services/scripts/scriptMcpTools'

const { execute } = createMCPHttpServer(
  'magickmonkey-scripts',
  '1.0.0',
  'MagickMonkey Git-backed Tampermonkey script file tools (list, get, upsert, delete).',
  buildScriptMcpToolsMap()
)

/**
 * POST /api/mcp/scripts/execute — JSON-RPC tools/list, tools/call, or legacy { tool, params }.
 */
export async function POST(req: NextRequest, context: { params: Promise<Record<string, string>> }) {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }
  return execute(req, context)
}
