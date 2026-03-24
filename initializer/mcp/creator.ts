import { type NextRequest, NextResponse } from 'next/server'

import type { ContextWithParams } from '@/initializer/controller'
import { api } from '@/initializer/controller'

import { applyNoStoreCache, JSONRPC, jsonRpcError, jsonRpcSuccess, mcpErrorinvalidArguments, mcpErrorMethodNotAllowed, mcpErrorToolNotFound, mcpResponse } from './response'
import type { Tool } from './tool'

/** MCP manifest tool entry */
export interface MCPManifestTool {
  description?: string
  inputSchema: unknown
  outputSchema?: unknown
}

/** MCP manifest returned by GET manifest route */
export interface MCPManifest {
  name: string
  version: string
  description?: string
  tools: Record<string, MCPManifestTool>
}

/**
 * Generate MCP manifest object from registered tools.
 * @param name Service name
 * @param version Service version
 * @param description Service description
 * @param toolsMap Tools keyed by name
 * @returns Serializable manifest
 */
export function generateMCPManifest(name: string, version: string, description: string, toolsMap: Map<string, Tool>): MCPManifest {
  const tools = Object.fromEntries(
    (function* () {
      for (const [, t] of toolsMap) {
        const manifest: MCPManifestTool = {
          description: t.description,
          inputSchema: t.manifest.parameters,
        }
        yield [t.name, manifest]
      }
    })()
  )

  return { name, version, description, tools }
}

/**
 * Wrap MCP request processing with method and JSON checks.
 * @param handler Inner handler
 * @param allowedMethods Allowed HTTP methods
 * @returns Next.js route handler
 */
function withMCPHandler<P = unknown>(
  handler: (req: NextRequest, context: ContextWithParams<P>) => Promise<NextResponse | Record<string, unknown>>,
  allowedMethods: string[] = ['GET', 'POST']
) {
  return api(async (req: NextRequest, context: ContextWithParams<P>) => {
    try {
      const method = req.method || 'GET'
      if (!allowedMethods.includes(method)) {
        return mcpErrorMethodNotAllowed(`Method ${method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`)
      }

      if (method === 'POST') {
        const contentType = req.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          return mcpErrorinvalidArguments('Content-Type must be application/json for POST requests')
        }
      }

      return await handler(req, context)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return mcpErrorinvalidArguments(message)
    }
  })
}

function createManifestHandler(name: string, version: string, description: string, tools: Map<string, Tool>) {
  return withMCPHandler(async () => {
    const manifest = generateMCPManifest(name, version, description, tools)
    return applyNoStoreCache(NextResponse.json({ type: 'result', result: manifest }))
  }, ['GET'])
}

function buildMCPToolsList(tools: Map<string, Tool>): { name: string; description?: string; inputSchema: unknown }[] {
  return Array.from(tools.entries()).map(([, t]) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.manifest.parameters,
  }))
}

async function handleJsonRpcRequest(
  body: { id?: string | number | null; method?: string; params?: unknown },
  tools: Map<string, Tool>,
  service: { name: string; version: string; description?: string }
): Promise<NextResponse> {
  const id = body.id ?? null

  if (body.method === 'initialize') {
    const protocolVersion = (body.params && (body.params as { protocolVersion?: string }).protocolVersion) || '2025-06-18'
    return jsonRpcSuccess(id, {
      protocolVersion,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: service.name,
        version: service.version,
        description: service.description,
      },
    })
  }

  if (body.method === 'tools/list') {
    const toolsList = buildMCPToolsList(tools)
    return jsonRpcSuccess(id, { tools: toolsList })
  }

  if (body.method === 'tools/call') {
    const params = (body.params ?? {}) as { name?: string; arguments?: Record<string, unknown> }
    const toolName = params.name
    const args = params.arguments ?? {}
    if (!toolName || typeof toolName !== 'string') {
      return jsonRpcError(id, JSONRPC.INVALID_PARAMS, 'Missing or invalid "params.name"')
    }

    const toolEntry = tools.get(toolName)
    if (!toolEntry) {
      return jsonRpcError(id, JSONRPC.INVALID_PARAMS, `Unknown tool: ${toolName}`)
    }

    const validation = toolEntry.validateParameters(args)
    if (validation !== true) {
      return jsonRpcError(id, JSONRPC.INVALID_PARAMS, String(validation))
    }

    try {
      const result = await toolEntry.call(args)
      const content = [{ type: 'text' as const, text: JSON.stringify(result) }]
      return jsonRpcSuccess(id, { content, isError: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return jsonRpcSuccess(id, {
        content: [{ type: 'text' as const, text: message }],
        isError: true,
      })
    }
  }

  return jsonRpcError(id, JSONRPC.METHOD_NOT_FOUND, `Method not found: ${body.method ?? 'undefined'}`)
}

function createToolExecutionHandler(name: string, version: string, description: string, tools: Map<string, Tool>) {
  return withMCPHandler(
    async (req: NextRequest) => {
      const body = await req.json().catch(() => null)
      if (body == null || typeof body !== 'object') {
        return mcpErrorinvalidArguments('Invalid JSON body')
      }

      const isJsonRpc = (body as { jsonrpc?: string; method?: string }).jsonrpc === '2.0' && typeof (body as { method?: string }).method === 'string'
      if (isJsonRpc) {
        return handleJsonRpcRequest(body as { id?: string | number | null; method?: string; params?: unknown }, tools, {
          name,
          version,
          description,
        })
      }

      const { tool: toolName, params = {} } = body as { tool?: string; params?: Record<string, unknown> }
      if (!toolName) {
        return mcpErrorinvalidArguments('Missing tool name')
      }

      const toolEntry = tools.get(toolName)
      if (!toolEntry) {
        return mcpErrorToolNotFound(`Tool "${toolName}" not found`)
      }

      const validation = toolEntry.validateParameters(params)
      if (validation !== true) {
        return mcpErrorinvalidArguments(validation)
      }

      const result = await toolEntry.call(params)
      return mcpResponse(result)
    },
    ['POST']
  )
}

/**
 * Create MCP HTTP handlers (manifest GET, execute POST) for a tool map.
 * @param name Service name
 * @param version Service version
 * @param description Service description
 * @param tools Tool map or plain record
 * @returns Route handlers for manifest and execute
 */
export function createMCPHttpServer(name: string, version: string, description: string, tools: Record<string, Tool> | Map<string, Tool>) {
  const toolsMap = tools instanceof Map ? tools : new Map(Object.entries(tools))
  const manifest = createManifestHandler(name, version, description, toolsMap)
  const execute = createToolExecutionHandler(name, version, description, toolsMap)
  return { manifest, execute }
}
