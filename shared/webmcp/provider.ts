import { VWS_WEBMCP_CANONICAL_NAME_PATTERN, VWS_WEBMCP_PAGE_SCRIPT_KEY, VWS_WEBMCP_PROVIDER_ID } from './constants'
import type { VwsWebMcpToolRecord, WebMcpToolProvider } from './types'

/**
 * Classify a WebMCP tool name by provider for extension Agent filtering.
 * @param name Tool name from listTools
 * @param registry MagickMonkey registry map (optional)
 * @returns Provider bucket
 */
export function classifyWebMcpToolProvider(name: string, registry?: ReadonlyMap<string, VwsWebMcpToolRecord> | null): WebMcpToolProvider {
  if (registry?.has(name) && registry.get(name)?.providerId === VWS_WEBMCP_PROVIDER_ID) {
    return 'magickmonkey'
  }
  // Builtin page tools are always MagickMonkey even when registry probe missed __GLOBAL__.
  if (name.startsWith(`vws.${VWS_WEBMCP_PAGE_SCRIPT_KEY}.`)) {
    return 'magickmonkey'
  }
  if (VWS_WEBMCP_CANONICAL_NAME_PATTERN.test(name)) {
    return 'unknown'
  }
  return 'native'
}
