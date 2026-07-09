import { VWS_WEBMCP_CANONICAL_NAME_PATTERN, VWS_WEBMCP_LOCAL_NAME_PATTERN, VWS_WEBMCP_NAME_PREFIX } from './constants'

/**
 * Validate a script-author local tool name.
 * @param localName Short name from Gist script
 * @returns Whether the name is allowed
 */
export function isValidVwsWebMcpLocalName(localName: string): boolean {
  const trimmed = localName.trim()
  if (!trimmed || trimmed !== localName) {
    return false
  }
  if (trimmed.startsWith(`${VWS_WEBMCP_NAME_PREFIX}`) || trimmed.includes('.')) {
    return false
  }
  return VWS_WEBMCP_LOCAL_NAME_PATTERN.test(trimmed)
}

/**
 * Build canonical WebMCP tool name for MagickMonkey scripts.
 * @param scriptKey Active script key
 * @param localName Short tool name
 * @returns `vws.{scriptKey}.{localName}`
 */
export function buildVwsWebMcpCanonicalName(scriptKey: string, localName: string): string {
  return `${VWS_WEBMCP_NAME_PREFIX}.${scriptKey}.${localName}`
}

/**
 * Parse canonical name into scriptKey and localName when pattern matches.
 * @param canonicalName Registered tool name
 * @returns Parsed segments or null
 */
export function parseVwsWebMcpCanonicalName(canonicalName: string): { scriptKey: string; localName: string } | null {
  const match = canonicalName.match(VWS_WEBMCP_CANONICAL_NAME_PATTERN)
  if (!match) {
    return null
  }
  return { scriptKey: match[1], localName: match[2] }
}
