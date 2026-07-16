/** Machine-readable provider id for MagickMonkey-registered WebMCP tools. */
export const VWS_WEBMCP_PROVIDER_ID = 'magickmonkey' as const

/** Canonical WebMCP tool name namespace prefix (MagickMonkey / VWS). */
export const VWS_WEBMCP_NAME_PREFIX = 'vws'

/** Display prefix for WebMCP tool titles. */
export const VWS_WEBMCP_TITLE_PREFIX = 'MagickMonkey'

/** Global registry key on preset / page sandbox (stable contract for extension Agent). */
export const VWS_WEBMCP_TOOL_REGISTRY_KEY = '__VWS_WEBMCP_TOOL_REGISTRY__'

/**
 * Page-local tool hint map (readOnlyHint etc.) for native page tools.
 * Used because Chromium WebMCP listTools often omits annotations.
 */
export const VWS_WEBMCP_PAGE_TOOL_HINTS_KEY = '__VWS_WEBMCP_PAGE_TOOL_HINTS__'

/** Matches `vws.{scriptKey}.{localName}` canonical tool names. */
export const VWS_WEBMCP_CANONICAL_NAME_PATTERN = /^vws\.([^.]+)\.([a-z][a-z0-9_]{0,63})$/

/** Allowed short local tool names passed by script authors. */
export const VWS_WEBMCP_LOCAL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
