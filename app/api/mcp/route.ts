import type { NextRequest } from 'next/server'

import { jsonUnauthorized } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'

import { execute, manifest } from './server'

/**
 * GET /api/mcp — MCP tool manifest (same auth as /api/v1/scripts).
 * @param req Incoming request
 * @param context Next.js route context
 * @returns JSON manifest or unauthorized
 */
export const GET = async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }
  return manifest(req, context)
}

/**
 * POST /api/mcp — JSON-RPC 2.0 (`initialize`, `tools/list`, `tools/call`) or legacy `{ tool, params }`.
 * Same protocol shape as GET/POST /api/mcp on the OpenAPI project.
 * @param req Incoming request
 * @param context Next.js route context
 * @returns JSON-RPC or REST-shaped response
 */
export const POST = async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }
  return execute(req, context)
}
