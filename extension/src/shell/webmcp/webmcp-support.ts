import { VWS_WEBMCP_PROVIDER_ID } from '@shared/webmcp/constants'
import type { VwsWebMcpToolRecord } from '@shared/webmcp/types'

import type { WebMcpCandidateTab, WebMcpProxyReason, WebMcpSupportPayload } from './webmcp-types'

/**
 * Whether a tab URL can host WebMCP tool discovery / execution.
 * @param url Tab URL
 */
export function isOperableHttpTabUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * Build human-readable hints for WebMCP support diagnostics.
 * @param reason Proxy reason code
 */
export function buildWebMcpSupportHints(reason: WebMcpProxyReason): string[] {
  switch (reason) {
    case 'no_secure_context':
      return ['WebMCP 需要 Secure Context（HTTPS 或 localhost）。']
    case 'api_missing':
      return [
        '当前 Tab 没有可用的 WebMCP testing API。',
        '请在 Chrome 打开 `chrome://flags/#enable-webmcp-testing` 并设为 Enabled，然后完全重启浏览器。',
        '需要 Chromium 146+（建议 Chrome 150+）。',
      ]
    case 'non_http_tab':
      return ['仅支持 http(s) 页面 Tab；chrome:// 与 extension:// 页面不可用。']
    case 'user_scripts_unavailable':
      return ['请在 chrome://extensions 中为本扩展启用 “Allow User Scripts”。']
    case 'csp_blocked':
      return ['页面 CSP 阻止了 MAIN world 注入；请刷新页面后重试。']
    case 'invalid_tab':
      return ['目标 Tab 不存在或已关闭。']
    case 'supported':
      return []
    default:
      return []
  }
}

/**
 * Map a list-tools probe into a support payload for the side panel.
 * @param probe Probe result from MAIN world
 */
export function buildWebMcpSupportPayloadFromProbe(probe: {
  ok?: boolean
  reason?: string
  details?: {
    isSecure?: boolean
    origin?: string | null
    hasTesting?: boolean
    hasListTools?: boolean
    hasExecuteTool?: boolean
  }
  registryEntries?: Array<{ name: string }>
}): WebMcpSupportPayload {
  const details = probe.details ?? {}
  const isSecureContext = details.isSecure === true
  const hasModelContextTesting = details.hasTesting === true
  const hasListTools = details.hasListTools === true
  const hasExecuteTool = details.hasExecuteTool === true
  const registrySize = probe.registryEntries?.length ?? 0

  let reason: WebMcpProxyReason = 'supported'
  if (!isSecureContext) {
    reason = 'no_secure_context'
  } else if (!hasListTools) {
    reason = 'api_missing'
  } else if (probe.ok !== true) {
    reason = 'api_missing'
  }

  return {
    supported: reason === 'supported',
    reason,
    hints: buildWebMcpSupportHints(reason),
    details: {
      isSecureContext,
      hasModelContextTesting,
      hasListTools,
      hasExecuteTool,
      origin: details.origin ?? null,
      registrySize,
    },
  }
}

/**
 * Build a registry map from serialized MAIN-world entries for provider classification.
 * @param entries Serialized registry rows
 */
export function buildRegistryMapFromProbeEntries(
  entries: Array<{
    name: string
    providerId?: string
    scriptKey?: string
    scriptFile?: string
    localName?: string
    readOnlyHint?: boolean
    description?: string
  }>
): Map<string, VwsWebMcpToolRecord> {
  const map = new Map<string, VwsWebMcpToolRecord>()
  for (const entry of entries) {
    if (!entry.name || entry.providerId !== VWS_WEBMCP_PROVIDER_ID) {
      continue
    }
    map.set(entry.name, {
      providerId: VWS_WEBMCP_PROVIDER_ID,
      canonicalName: entry.name,
      localName: entry.localName ?? '',
      scriptKey: entry.scriptKey ?? '',
      scriptFile: entry.scriptFile ?? 'unknown',
      description: entry.description ?? '',
      readOnlyHint: entry.readOnlyHint === true,
      registeredAt: 0,
    })
  }
  return map
}

/**
 * List http(s) tabs in the current window for side panel target selection.
 */
export async function listWebMcpCandidateTabs(): Promise<WebMcpCandidateTab[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  return tabs
    .filter((tab): tab is chrome.tabs.Tab & { id: number; url: string } => tab.id != null && typeof tab.url === 'string')
    .map((tab) => ({
      tabId: tab.id,
      title: tab.title ?? tab.url,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      operable: isOperableHttpTabUrl(tab.url),
    }))
}

/**
 * Resolve a tab by id and validate it exists.
 * @param tabId Chrome tab id
 */
export async function getTabById(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  try {
    return await chrome.tabs.get(tabId)
  } catch {
    return undefined
  }
}
