import type { VWS_WEBMCP_PROVIDER_ID } from './constants'

/** Tool definition input from Gist scripts (short local name). */
export interface VwsWebMcpToolInput {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>
  annotations?: { readOnlyHint?: boolean }
  title?: string
}

/** WebMCP tool shape passed to `document.modelContext.registerTool`. */
export interface WebMcpToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown
  annotations?: {
    readOnlyHint?: boolean
  }
}

/** Registry record for extension Agent provider classification. */
export interface VwsWebMcpToolRecord {
  providerId: typeof VWS_WEBMCP_PROVIDER_ID
  canonicalName: string
  localName: string
  scriptKey: string
  scriptFile: string
  description: string
  readOnlyHint: boolean
  registeredAt: number
}

/** Result of `registerVwsWebMcpTool` / `GME_registerWebMcpTool`. */
export interface RegisterVwsWebMcpToolResult {
  ok: boolean
  canonicalName?: string
  reason?: 'unsupported' | 'missing_script_key' | 'invalid_local_name' | 'duplicate' | 'register_failed'
  message?: string
}

/** Tool metadata returned by `document.modelContext.getTools()`. */
export interface WebMcpRegisteredToolInfo {
  name: string
  description?: string
  origin?: string
}

/** Minimal `document.modelContext` surface. */
export interface DocumentModelContext {
  registerTool: (definition: WebMcpToolDefinition, options?: { signal?: AbortSignal }) => Promise<unknown>
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredToolInfo[]>
}

export type WebMcpToolProvider = 'magickmonkey' | 'native' | 'unknown'
