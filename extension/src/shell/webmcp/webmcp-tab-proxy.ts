import { classifyWebMcpToolProvider } from '@shared/webmcp/provider'
import type { VwsWebMcpToolRecord } from '@shared/webmcp/types'

import { executeRawMainWorldCodeForTab, isUserScriptsApiAvailable } from '../csp-user-script-executor'
import { buildExecuteToolCode, buildListToolsProbeCode } from './webmcp-inject-scripts'
import { buildRegistryMapFromProbeEntries, buildWebMcpSupportPayloadFromProbe, getTabById, isOperableHttpTabUrl, listWebMcpCandidateTabs } from './webmcp-support'
import type {
  WebMcpExecuteToolPayload,
  WebMcpExecuteToolProbeResult,
  WebMcpListToolsPayload,
  WebMcpListToolsProbeResult,
  WebMcpProxyReason,
  WebMcpProxyResult,
  WebMcpRawListedTool,
  WebMcpSupportPayload,
} from './webmcp-types'

function failure<T>(reason: WebMcpProxyReason, message: string): WebMcpProxyResult<T> {
  return { ok: false, reason, message }
}

async function runListToolsProbe(tabId: number): Promise<WebMcpProxyResult<WebMcpListToolsProbeResult>> {
  if (!isUserScriptsApiAvailable()) {
    return failure('user_scripts_unavailable', 'User Scripts API is not available for this extension.')
  }

  const executeResult = await executeRawMainWorldCodeForTab(tabId, buildListToolsProbeCode())
  if (!executeResult.ok) {
    if (executeResult.cspBlocked) {
      return failure('csp_blocked', executeResult.message)
    }
    return failure('injection_failed', executeResult.message)
  }

  const probe = normalizeProbeResult(executeResult.value)
  if (!probe) {
    return failure('internal_error', 'WebMCP list probe returned an invalid payload.')
  }

  return { ok: true, reason: probe.ok ? 'supported' : mapProbeReason(probe.reason), data: probe }
}

function normalizeProbeResult(value: unknown): WebMcpListToolsProbeResult | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as WebMcpListToolsProbeResult
}

function mapProbeReason(reason: string | undefined): WebMcpProxyReason {
  switch (reason) {
    case 'no_secure_context':
      return 'no_secure_context'
    case 'api_missing':
      return 'api_missing'
    case 'internal_error':
      return 'internal_error'
    default:
      return 'api_missing'
  }
}

function mergeListedTools(probe: WebMcpListToolsProbeResult): WebMcpListToolsPayload {
  const registry = buildRegistryMapFromProbeEntries(probe.registryEntries ?? [])
  const rawTools = Array.isArray(probe.tools) ? probe.tools : []
  const tools = rawTools.map((raw) => mergeListedTool(raw, registry)).filter((tool): tool is NonNullable<typeof tool> => tool != null)

  const filteredCount = tools.filter((tool) => tool.provider === 'magickmonkey').length
  return {
    tools,
    filteredCount,
    totalCount: tools.length,
  }
}

function mergeListedTool(raw: WebMcpRawListedTool, registry: Map<string, VwsWebMcpToolRecord>) {
  const name = typeof raw.name === 'string' ? raw.name : ''
  if (!name) {
    return null
  }
  const record = registry.get(name)
  const provider = classifyWebMcpToolProvider(name, registry)
  return {
    name,
    description: typeof raw.description === 'string' ? raw.description : record?.description,
    inputSchema: raw.inputSchema && typeof raw.inputSchema === 'object' ? raw.inputSchema : undefined,
    provider,
    scriptKey: record?.scriptKey,
    scriptFile: record?.scriptFile,
    localName: record?.localName,
    readOnlyHint: raw.annotations?.readOnlyHint === true || record?.readOnlyHint === true,
  }
}

async function validateOperableTab(tabId: number): Promise<WebMcpProxyResult<{ tab: chrome.tabs.Tab }>> {
  const tab = await getTabById(tabId)
  if (!tab) {
    return failure('invalid_tab', `Tab ${tabId} was not found.`)
  }
  if (!isOperableHttpTabUrl(tab.url)) {
    return failure('non_http_tab', 'WebMCP is only available on http(s) pages.')
  }
  return { ok: true, reason: 'supported', data: { tab } }
}

/**
 * Probe WebMCP availability for a tab.
 * @param tabId Target tab id
 */
export async function webMcpGetSupport(tabId: number): Promise<WebMcpProxyResult<WebMcpSupportPayload>> {
  const tabCheck = await validateOperableTab(tabId)
  if (!tabCheck.ok) {
    return tabCheck as WebMcpProxyResult<WebMcpSupportPayload>
  }

  const probeResult = await runListToolsProbe(tabId)
  if (!probeResult.ok || !probeResult.data) {
    return probeResult as WebMcpProxyResult<WebMcpSupportPayload>
  }

  return {
    ok: true,
    reason: probeResult.data.ok ? 'supported' : mapProbeReason(probeResult.data.reason),
    data: buildWebMcpSupportPayloadFromProbe(probeResult.data),
  }
}

/**
 * List WebMCP tools registered in a tab.
 * @param tabId Target tab id
 */
export async function webMcpListTools(tabId: number): Promise<WebMcpProxyResult<WebMcpListToolsPayload>> {
  const tabCheck = await validateOperableTab(tabId)
  if (!tabCheck.ok) {
    return tabCheck as WebMcpProxyResult<WebMcpListToolsPayload>
  }

  const probeResult = await runListToolsProbe(tabId)
  if (!probeResult.ok || !probeResult.data) {
    return probeResult as WebMcpProxyResult<WebMcpListToolsPayload>
  }

  if (probeResult.data.ok !== true) {
    return {
      ok: false,
      reason: mapProbeReason(probeResult.data.reason),
      message: probeResult.data.message ?? 'WebMCP tools are not available in this tab.',
    }
  }

  return {
    ok: true,
    reason: 'supported',
    data: mergeListedTools(probeResult.data),
  }
}

/**
 * Execute a WebMCP tool in a tab.
 * @param tabId Target tab id
 * @param name Canonical tool name
 * @param args Tool input object
 */
export async function webMcpExecuteTool(tabId: number, name: string, args: Record<string, unknown>): Promise<WebMcpProxyResult<WebMcpExecuteToolPayload>> {
  const tabCheck = await validateOperableTab(tabId)
  if (!tabCheck.ok) {
    return tabCheck as WebMcpProxyResult<WebMcpExecuteToolPayload>
  }

  if (!name.trim()) {
    return failure('tool_not_found', 'Tool name is required.')
  }

  if (!isUserScriptsApiAvailable()) {
    return failure('user_scripts_unavailable', 'User Scripts API is not available for this extension.')
  }

  const executeResult = await executeRawMainWorldCodeForTab(tabId, buildExecuteToolCode(name, args))
  if (!executeResult.ok) {
    if (executeResult.cspBlocked) {
      return failure('csp_blocked', executeResult.message)
    }
    return failure('injection_failed', executeResult.message)
  }

  const probe = executeResult.value as WebMcpExecuteToolProbeResult | null
  if (!probe || typeof probe !== 'object') {
    return failure('internal_error', 'WebMCP execute probe returned an invalid payload.')
  }

  if (probe.ok !== true) {
    const reason: WebMcpProxyReason = probe.reason === 'api_missing' ? 'api_missing' : probe.reason === 'tool_execute_failed' ? 'tool_execute_failed' : 'tool_execute_failed'
    return {
      ok: false,
      reason,
      message: probe.message ?? `Failed to execute tool "${name}".`,
    }
  }

  return {
    ok: true,
    reason: 'supported',
    data: {
      name,
      result: probe.result,
    },
  }
}

/**
 * List candidate tabs for WebMCP operations in the current window.
 */
export async function webMcpListCandidateTabs(): Promise<WebMcpProxyResult<{ tabs: Awaited<ReturnType<typeof listWebMcpCandidateTabs>> }>> {
  const tabs = await listWebMcpCandidateTabs()
  return {
    ok: true,
    reason: 'supported',
    data: { tabs },
  }
}
