import { VWS_WEBMCP_PAGE_TOOL_HINTS_KEY } from './constants'
import { readWebMcpGlobalHosts } from './registry'

export type VwsWebMcpPageToolHint = {
  readOnlyHint: boolean
}

type PageHintsMap = Map<string, VwsWebMcpPageToolHint>

/**
 * Get or create the page-local WebMCP tool hint map (readOnlyHint for native page tools).
 * Chromium listTools often omits annotations; MagickMonkey pages stash hints here at register time.
 * @returns Mutable hint map
 */
export function getOrCreateVwsWebMcpPageToolHints(): PageHintsMap {
  for (const host of readWebMcpGlobalHosts()) {
    const existing = host[VWS_WEBMCP_PAGE_TOOL_HINTS_KEY]
    if (existing instanceof Map) {
      return existing
    }
  }

  const hints: PageHintsMap = new Map()
  const primaryHost = readWebMcpGlobalHosts()[0] ?? (globalThis as unknown as Record<string, unknown>)
  primaryHost[VWS_WEBMCP_PAGE_TOOL_HINTS_KEY] = hints
  return hints
}

/**
 * Remember annotations for a page-registered WebMCP tool.
 * @param name Canonical tool name
 * @param readOnlyHint Whether the tool is read-only
 * @param signal Optional abort that clears the hint
 */
export function rememberVwsWebMcpPageToolHint(name: string, readOnlyHint: boolean, signal?: AbortSignal): void {
  const hints = getOrCreateVwsWebMcpPageToolHints()
  hints.set(name, { readOnlyHint })
  if (!signal) {
    return
  }
  signal.addEventListener(
    'abort',
    () => {
      hints.delete(name)
    },
    { once: true }
  )
}
