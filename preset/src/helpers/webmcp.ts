import { registerVwsWebMcpTool, type RegisterVwsWebMcpToolResult, type VwsWebMcpToolInput } from '@shared/webmcp/register-tool'

import { GME_warn } from '@/helpers/logger'

export type GME_WebMcpToolDefinition = VwsWebMcpToolInput
export type GME_RegisterWebMcpToolResult = RegisterVwsWebMcpToolResult

/**
 * Register a WebMCP tool for the MagickMonkey extension Agent (`vws.{scriptKey}.{name}`).
 * @param definition Short local tool name and execute handler
 * @param options Optional abort signal for unregister
 * @returns Structured registration result
 */
export async function GME_registerWebMcpTool(definition: GME_WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<GME_RegisterWebMcpToolResult> {
  return registerVwsWebMcpTool(definition, {
    signal: options?.signal,
    warn: GME_warn,
  })
}
