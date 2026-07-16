import type { WebMcpToolProvider } from '@shared/webmcp/types'

/** Chrome command id for opening the Agent side panel. */
export const WEBMCP_OPEN_SIDE_PANEL_COMMAND = 'open_agent_side_panel'

/** Machine-readable WebMCP proxy failure / state codes. */
export type WebMcpProxyReason =
  | 'supported'
  | 'api_missing'
  | 'no_secure_context'
  | 'no_document'
  | 'invalid_tab'
  | 'non_http_tab'
  | 'user_scripts_unavailable'
  | 'injection_failed'
  | 'csp_blocked'
  | 'tool_not_found'
  | 'tool_execute_failed'
  | 'internal_error'

/** Unified WebMCP proxy response envelope. */
export interface WebMcpProxyResult<T> {
  ok: boolean
  reason?: WebMcpProxyReason
  message?: string
  data?: T
}

export interface WebMcpSupportPayload {
  supported: boolean
  reason: WebMcpProxyReason
  hints: string[]
  details: {
    isSecureContext: boolean
    hasModelContextTesting: boolean
    hasListTools: boolean
    hasExecuteTool: boolean
    origin: string | null
    registrySize: number
  }
}

export interface WebMcpListedTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  provider: WebMcpToolProvider
  scriptKey?: string
  scriptFile?: string
  localName?: string
  readOnlyHint?: boolean
}

export interface WebMcpListToolsPayload {
  tools: WebMcpListedTool[]
  filteredCount: number
  totalCount: number
}

export interface WebMcpExecuteToolPayload {
  name: string
  result: unknown
}

export interface WebMcpCandidateTab {
  tabId: number
  title: string
  url: string
  favIconUrl?: string
  operable: boolean
}

/** Raw tool row from page `listTools` / `getTools`. */
export interface WebMcpRawListedTool {
  name?: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean }
}

/** Registry row serialized from MAIN world `__VWS_WEBMCP_TOOL_REGISTRY__`. */
export interface WebMcpProbeRegistryEntry {
  name: string
  providerId?: string
  scriptKey?: string
  scriptFile?: string
  localName?: string
  readOnlyHint?: boolean
  description?: string
}

/** MAIN-world listTools probe payload. */
export interface WebMcpListToolsProbeResult {
  ok?: boolean
  reason?: string
  message?: string
  tools?: WebMcpRawListedTool[]
  registryEntries?: WebMcpProbeRegistryEntry[]
  /** Page-stashed annotations for native tools (Chromium listTools often omits them). */
  pageHintEntries?: Array<{ name: string; readOnlyHint?: boolean }>
  details?: {
    isSecure?: boolean
    origin?: string | null
    hasTesting?: boolean
    hasListTools?: boolean
    hasExecuteTool?: boolean
    hasGetTools?: boolean
  }
}

/** MAIN-world executeTool probe payload. */
export interface WebMcpExecuteToolProbeResult {
  ok?: boolean
  reason?: string
  message?: string
  result?: unknown
}
