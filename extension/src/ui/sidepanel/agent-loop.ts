import { sendShellMessage } from '@ext/shared/messages'
import type { AgentLlmMessage } from '@ext/shell/webmcp/agent-types'
import type { WebMcpListedTool } from '@ext/shell/webmcp/webmcp-types'

import { loadAgentPrefs } from './agent-storage'
import { buildAgentSystemPrompt, filterToolsForAgent, fromLlmToolName, shouldConfirmTool, toAgentLlmTools } from './agent-tools'

export type AgentUiMessage =
  | { id: string; kind: 'user'; text: string; createdAt: number }
  | { id: string; kind: 'assistant'; text: string; createdAt: number }
  | { id: string; kind: 'tool'; name: string; args: Record<string, unknown>; ok: boolean; summary: string; createdAt: number }

export type AgentLoopEvent = { type: 'message'; message: AgentUiMessage } | { type: 'status'; text: string } | { type: 'done' } | { type: 'error'; message: string }

const MAX_AGENT_ROUNDS = 10

function uid(): string {
  return crypto.randomUUID()
}

async function listToolsForTab(tabId: number): Promise<WebMcpListedTool[]> {
  const response = await sendShellMessage({ type: 'WEBMCP_LIST_TOOLS', tabId })
  if (!response.ok) {
    throw new Error(response.error ?? 'Failed to list WebMCP tools.')
  }
  if (!('webmcp' in response) || !response.webmcp?.ok || !response.webmcp.data) {
    throw new Error('webmcp' in response ? (response.webmcp?.message ?? 'Failed to list WebMCP tools.') : 'Failed to list WebMCP tools.')
  }
  const payload = response.webmcp.data as { tools?: WebMcpListedTool[] }
  return payload.tools ?? []
}

async function executeToolForTab(tabId: number, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await sendShellMessage({ type: 'WEBMCP_EXECUTE_TOOL', tabId, name, args })
  if (!response.ok) {
    throw new Error(response.error ?? `Failed to execute ${name}.`)
  }
  if (!('webmcp' in response) || !response.webmcp?.ok) {
    throw new Error('webmcp' in response ? (response.webmcp?.message ?? `Failed to execute ${name}.`) : `Failed to execute ${name}.`)
  }
  const payload = response.webmcp.data as { result?: unknown } | undefined
  return payload?.result
}

/**
 * Run a multi-turn agent loop for a user message against the active tab.
 * @param input Loop parameters
 */
export async function runAgentLoop(input: {
  tabId: number
  tabUrl: string
  userText: string
  signal?: AbortSignal
  /** When true, the caller already rendered/updated the user message. */
  skipUserMessageEvent?: boolean
  onEvent: (event: AgentLoopEvent) => void
}): Promise<void> {
  const prefs = await loadAgentPrefs()
  const host = (() => {
    try {
      return new URL(input.tabUrl).hostname
    } catch {
      return ''
    }
  })()

  input.onEvent({ type: 'status', text: 'Connecting to page…' })
  let availableTools = filterToolsForAgent(await listToolsForTab(input.tabId), prefs)

  const history: AgentLlmMessage[] = [
    {
      role: 'system',
      text: buildAgentSystemPrompt(
        input.tabUrl,
        prefs.byHost?.[host],
        availableTools.map((tool) => tool.name)
      ),
    },
    {
      role: 'user',
      text: input.userText,
    },
  ]

  if (!input.skipUserMessageEvent) {
    input.onEvent({
      type: 'message',
      message: { id: uid(), kind: 'user', text: input.userText, createdAt: Date.now() },
    })
  }

  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    input.onEvent({ type: 'status', text: round === 0 ? 'Thinking…' : `Tool round ${round + 1}…` })

    const response = await sendShellMessage({
      type: 'AGENT_LLM_GENERATE',
      requestId: uid(),
      messages: history,
      tools: availableTools.length > 0 ? toAgentLlmTools(availableTools) : undefined,
    })

    if (!response.ok) {
      throw new Error(response.error ?? 'LLM request failed.')
    }
    if (!('agentLlm' in response) || !response.agentLlm) {
      throw new Error('LLM request failed.')
    }

    const { content, toolCalls } = response.agentLlm

    if (content) {
      input.onEvent({
        type: 'message',
        message: { id: uid(), kind: 'assistant', text: content, createdAt: Date.now() },
      })
    }

    if (!toolCalls || toolCalls.length === 0) {
      input.onEvent({ type: 'done' })
      return
    }

    history.push({
      role: 'model',
      text: content,
      toolCalls,
    })

    const toolResults: AgentLlmMessage['toolResults'] = []

    for (const call of toolCalls) {
      if (input.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const canonical = fromLlmToolName(call.name, availableTools)
      if (!canonical) {
        const summary = `Unknown tool: ${call.name}`
        toolResults.push({ name: call.name, result: { ok: false, error: summary } })
        input.onEvent({
          type: 'message',
          message: { id: uid(), kind: 'tool', name: call.name, args: call.args, ok: false, summary, createdAt: Date.now() },
        })
        continue
      }

      const toolMeta = availableTools.find((tool) => tool.name === canonical)
      if (shouldConfirmTool(toolMeta, prefs)) {
        const ok = window.confirm(`Execute tool "${canonical}"?\n\n${JSON.stringify(call.args, null, 2)}`)
        if (!ok) {
          const summary = 'Cancelled by user.'
          toolResults.push({ name: call.name, result: { ok: false, cancelled: true } })
          input.onEvent({
            type: 'message',
            message: { id: uid(), kind: 'tool', name: canonical, args: call.args, ok: false, summary, createdAt: Date.now() },
          })
          continue
        }
      }

      try {
        const result = await executeToolForTab(input.tabId, canonical, call.args)
        const summary = typeof result === 'string' ? result : JSON.stringify(result)
        toolResults.push({ name: call.name, result })
        input.onEvent({
          type: 'message',
          message: { id: uid(), kind: 'tool', name: canonical, args: call.args, ok: true, summary, createdAt: Date.now() },
        })
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error)
        toolResults.push({ name: call.name, result: { ok: false, error: summary } })
        input.onEvent({
          type: 'message',
          message: { id: uid(), kind: 'tool', name: canonical, args: call.args, ok: false, summary, createdAt: Date.now() },
        })
      }
    }

    history.push({
      role: 'model',
      toolResults,
    })

    availableTools = filterToolsForAgent(await listToolsForTab(input.tabId), prefs)
  }

  input.onEvent({ type: 'error', message: 'Reached maximum tool rounds.' })
  input.onEvent({ type: 'done' })
}
