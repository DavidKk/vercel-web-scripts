/**
 * Cursor / VS Code MCP one-click install helpers (same pattern as vercel-openapi).
 * {@link MCP_INSTALL_SERVER_KEY} must match `MCP_NAME` in `./server.ts`.
 */

/** MCP server key in editor config — must match manifest `name` */
export const MCP_INSTALL_SERVER_KEY = 'magickmonkey-scripts'

/**
 * Strips empty header values so install JSON / deep links only include real auth keys.
 * @param headers Raw header map from `/api/mcp/headers`
 * @returns Copy with only non-empty string values, or `undefined` if none
 */
export function normalizeMcpAuthHeaders(headers?: Record<string, string> | null): Record<string, string> | undefined {
  if (!headers) {
    return undefined
  }
  const entries = Object.entries(headers).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
  if (entries.length === 0) {
    return undefined
  }
  return Object.fromEntries(entries)
}

function utf8JsonToBase64(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/**
 * Build JSON snippet for Cursor `mcp.json` remote HTTP server entry.
 * @param mcpHttpUrl Absolute MCP endpoint URL
 * @param serverKey Optional override; defaults to {@link MCP_INSTALL_SERVER_KEY}
 * @param headers Optional auth headers (e.g. API key) — included when non-empty
 * @returns Pretty-printed JSON string
 */
export function buildCursorMcpJson(mcpHttpUrl: string, serverKey: string = MCP_INSTALL_SERVER_KEY, headers?: Record<string, string> | null): string {
  const h = normalizeMcpAuthHeaders(headers ?? undefined)
  const entry: Record<string, unknown> = { url: mcpHttpUrl }
  if (h) {
    entry.headers = h
  }
  return JSON.stringify({ mcpServers: { [serverKey]: entry } }, null, 2)
}

/**
 * Build Cursor deep link to install this HTTP MCP server.
 * @param mcpHttpUrl Absolute MCP endpoint URL
 * @param serverKey Optional override; defaults to {@link MCP_INSTALL_SERVER_KEY}
 * @param headers Optional auth headers for the server entry (embedded in base64 `config`)
 * @returns `cursor://...` URL
 */
export function buildCursorMcpInstallDeepLink(mcpHttpUrl: string, serverKey: string = MCP_INSTALL_SERVER_KEY, headers?: Record<string, string> | null): string {
  const h = normalizeMcpAuthHeaders(headers ?? undefined)
  const configObj: Record<string, unknown> = { url: mcpHttpUrl }
  if (h) {
    configObj.headers = h
  }
  const config = encodeURIComponent(utf8JsonToBase64(JSON.stringify(configObj)))
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(serverKey)}&config=${config}`
}

export type VsCodeMcpInstallChannel = 'stable' | 'insiders'

/**
 * Build VS Code / Insiders deep link to install this HTTP MCP server.
 * @param mcpHttpUrl Absolute MCP endpoint URL
 * @param serverKey Optional override; defaults to {@link MCP_INSTALL_SERVER_KEY}
 * @param channel VS Code distribution
 * @param headers Optional auth headers for the HTTP MCP entry
 * @returns `vscode:` or `vscode-insiders:` URL
 */
export function buildVsCodeMcpInstallDeepLink(
  mcpHttpUrl: string,
  serverKey: string = MCP_INSTALL_SERVER_KEY,
  channel: VsCodeMcpInstallChannel = 'stable',
  headers?: Record<string, string> | null
): string {
  const h = normalizeMcpAuthHeaders(headers ?? undefined)
  const payload = {
    name: serverKey,
    type: 'http' as const,
    url: mcpHttpUrl,
    headers: h ?? {},
  }
  const scheme = channel === 'insiders' ? 'vscode-insiders' : 'vscode'
  return `${scheme}:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`
}
