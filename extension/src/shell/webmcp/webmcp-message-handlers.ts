import type { ShellMessage, ShellResponse } from '@ext/shared/messages'

import { generateAgentLlmResponse, listAgentLlmModels } from './agent-llm'
import { openAgentSidePanelForActiveWindow, openAgentSidePanelFromUserGesture } from './webmcp-side-panel'
import { webMcpExecuteTool, webMcpGetSupport, webMcpListCandidateTabs, webMcpListTools } from './webmcp-tab-proxy'

/**
 * Handle WebMCP-related shell messages from popup, side panel, or admin debug UI.
 * @param message Shell message
 */
export async function handleWebMcpShellMessage(message: ShellMessage): Promise<ShellResponse> {
  switch (message.type) {
    case 'OPEN_SIDE_PANEL': {
      try {
        await openAgentSidePanelFromUserGesture()
        return { ok: true, message: 'Side panel opened.' }
      } catch {
        await openAgentSidePanelForActiveWindow()
        return { ok: true, message: 'Side panel opened.' }
      }
    }
    case 'WEBMCP_GET_SUPPORT': {
      const webmcp = await webMcpGetSupport(message.tabId)
      return { ok: true, webmcp }
    }
    case 'WEBMCP_LIST_TOOLS': {
      const webmcp = await webMcpListTools(message.tabId)
      return { ok: true, webmcp }
    }
    case 'WEBMCP_EXECUTE_TOOL': {
      const webmcp = await webMcpExecuteTool(message.tabId, message.name, message.args)
      return { ok: true, webmcp }
    }
    case 'WEBMCP_LIST_CANDIDATE_TABS': {
      const webmcp = await webMcpListCandidateTabs()
      return { ok: true, webmcp }
    }
    case 'AGENT_LLM_GENERATE': {
      try {
        const agentLlm = await generateAgentLlmResponse({
          requestId: message.requestId,
          messages: message.messages,
          tools: message.tools,
        })
        return { ok: true, agentLlm }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
    case 'AGENT_LLM_LIST_MODELS': {
      try {
        const agentLlmModels = await listAgentLlmModels({
          apiKey: message.apiKey,
          proxyEnabled: message.proxyEnabled,
          baseUrl: message.baseUrl,
          proxyHeaders: message.proxyHeaders,
          provider: message.provider,
        })
        return { ok: true, agentLlmModels }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
    default:
      return { ok: false, error: 'Unknown WebMCP message' }
  }
}

/**
 * Whether a shell message is handled by the WebMCP proxy layer.
 * @param message Shell message
 */
export function isWebMcpShellMessage(message: ShellMessage): boolean {
  return (
    message.type === 'OPEN_SIDE_PANEL' ||
    message.type === 'WEBMCP_GET_SUPPORT' ||
    message.type === 'WEBMCP_LIST_TOOLS' ||
    message.type === 'WEBMCP_EXECUTE_TOOL' ||
    message.type === 'WEBMCP_LIST_CANDIDATE_TABS' ||
    message.type === 'AGENT_LLM_GENERATE' ||
    message.type === 'AGENT_LLM_LIST_MODELS'
  )
}
