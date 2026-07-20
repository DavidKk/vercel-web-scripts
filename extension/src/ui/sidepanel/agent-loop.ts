import { sendShellMessage } from '@ext/shared/messages'
import type { AgentLlmMessage } from '@ext/shell/webmcp/agent-types'
import type { WebMcpListedTool } from '@ext/shell/webmcp/webmcp-types'

import { loadAgentPrefs } from './agent-storage'
import { buildAgentSystemPrompt, filterToolsForAgent, fromLlmToolName, resolvePageToolsHint, shouldConfirmTool, toAgentLlmTools } from './agent-tools'

export type AgentUiMessage =
  | { id: string; kind: 'user'; text: string; createdAt: number }
  | { id: string; kind: 'assistant'; text: string; createdAt: number }
  | { id: string; kind: 'tool'; name: string; args: Record<string, unknown>; ok: boolean; summary: string; createdAt: number }

export type AgentLoopEvent =
  | { type: 'message'; message: AgentUiMessage }
  | {
      type: 'status'
      /** Short phase label shown in the Thinking card header (Codex-style). */
      text: string
      /** Optional longer description appended to the Thinking log body. */
      detail?: string
    }
  | { type: 'done' }
  | { type: 'error'; message: string }

const MAX_AGENT_ROUNDS = 10

function uid(): string {
  return crypto.randomUUID()
}

function emitStatus(onEvent: (event: AgentLoopEvent) => void, text: string, detail?: string): void {
  onEvent({ type: 'status', text, detail })
}

/**
 * List tools for a tab. Soft-fails to an empty list + diagnostic when WebMCP is unavailable
 * so the Agent can explain setup steps instead of aborting the turn.
 * @param tabId Active tab id
 */
async function listToolsForTab(tabId: number): Promise<{ tools: WebMcpListedTool[]; pageToolsHint?: string }> {
  const response = await sendShellMessage({ type: 'WEBMCP_LIST_TOOLS', tabId })
  if (!response.ok) {
    return {
      tools: [],
      pageToolsHint: resolvePageToolsHint([], undefined, response.error ?? 'Failed to list WebMCP tools.'),
    }
  }
  if (!('webmcp' in response) || !response.webmcp) {
    return {
      tools: [],
      pageToolsHint: resolvePageToolsHint([], undefined, 'Failed to list WebMCP tools.'),
    }
  }
  if (!response.webmcp.ok || !response.webmcp.data) {
    return {
      tools: [],
      pageToolsHint: resolvePageToolsHint([], undefined, response.webmcp.message ?? 'Failed to list WebMCP tools.'),
    }
  }
  const payload = response.webmcp.data as {
    tools?: WebMcpListedTool[]
    pageToolsEnsure?: {
      attempted: boolean
      ok: boolean
      skippedReason?: string
      message?: string
      registered?: string[]
    }
  }
  const tools = payload.tools ?? []
  return {
    tools,
    pageToolsHint: resolvePageToolsHint(tools, payload.pageToolsEnsure),
  }
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

  if (!input.skipUserMessageEvent) {
    input.onEvent({
      type: 'message',
      message: { id: uid(), kind: 'user', text: input.userText, createdAt: Date.now() },
    })
  }

  emitStatus(input.onEvent, 'Connecting to page…', 'Checking the active tab and discovering WebMCP tools.')
  const listed = await listToolsForTab(input.tabId)
  let availableTools = filterToolsForAgent(listed.tools, prefs)
  const toolCount = availableTools.length
  emitStatus(
    input.onEvent,
    toolCount > 0 ? `Found ${toolCount} tool${toolCount === 1 ? '' : 's'}` : 'No tools on this page',
    toolCount > 0
      ? `Ready to use ${toolCount} WebMCP tool${toolCount === 1 ? '' : 's'} for this tab.`
      : listed.pageToolsHint
        ? `No WebMCP tools listed. ${listed.pageToolsHint}`
        : 'No WebMCP tools are registered on this page right now; the model will answer without tool calls.'
  )

  const history: AgentLlmMessage[] = [
    {
      role: 'system',
      text: buildAgentSystemPrompt(
        input.tabUrl,
        prefs.byHost?.[host],
        availableTools.map((tool) => tool.name),
        listed.pageToolsHint
      ),
    },
    {
      role: 'user',
      text: input.userText,
    },
  ]

  let emptyAnswerNudgeUsed = false
  let preferTextOnly = false
  let lastToolSummaries: string[] = []

  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    if (input.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    emitStatus(
      input.onEvent,
      round === 0 ? 'Thinking…' : `Thinking · round ${round + 1}`,
      round === 0 ? 'Asking the model how to answer your request.' : 'Sending tool results back to the model for the next step.'
    )

    const response = await sendShellMessage({
      type: 'AGENT_LLM_GENERATE',
      requestId: uid(),
      messages: history,
      // After an empty post-tool reply, omit tools so the model must write text.
      tools: preferTextOnly || availableTools.length === 0 ? undefined : toAgentLlmTools(availableTools),
    })
    preferTextOnly = false

    if (!response.ok) {
      throw new Error(response.error ?? 'LLM request failed.')
    }
    if (!('agentLlm' in response) || !response.agentLlm) {
      throw new Error('LLM request failed.')
    }

    const { content, toolCalls } = response.agentLlm
    const contentText = typeof content === 'string' ? content.trim() : ''

    if (contentText) {
      input.onEvent({
        type: 'message',
        message: { id: uid(), kind: 'assistant', text: contentText, createdAt: Date.now() },
      })
    }

    if (!toolCalls || toolCalls.length === 0) {
      if (contentText) {
        emitStatus(input.onEvent, 'Finishing…', 'The model returned a final answer.')
        input.onEvent({ type: 'done' })
        return
      }

      // Some models stop after tools with empty text — nudge once for a written answer.
      if (lastToolSummaries.length > 0 && !emptyAnswerNudgeUsed) {
        emptyAnswerNudgeUsed = true
        preferTextOnly = true
        emitStatus(input.onEvent, 'Asking for a written answer…', 'The model returned tool results without text; requesting a natural-language reply.')
        history.push({
          role: 'user',
          text: 'Please answer the user in natural language based on the tool results above. Do not call more tools. Lead with a short clear answer.',
        })
        continue
      }

      if (lastToolSummaries.length > 0) {
        const fallback = [
          'I ran the tools but the model did not return a written summary. Here is the latest tool output:',
          ...lastToolSummaries.map((summary) => truncateToolSummary(summary)),
        ].join('\n\n')
        input.onEvent({
          type: 'message',
          message: { id: uid(), kind: 'assistant', text: fallback, createdAt: Date.now() },
        })
        emitStatus(input.onEvent, 'Finishing…', 'Used tool output as a fallback answer.')
        input.onEvent({ type: 'done' })
        return
      }

      emitStatus(input.onEvent, 'Finishing…', 'The model returned an empty answer.')
      input.onEvent({ type: 'error', message: 'The model returned an empty answer. Try again or switch models.' })
      input.onEvent({ type: 'done' })
      return
    }

    history.push({
      role: 'model',
      text: contentText || undefined,
      toolCalls,
    })

    const toolResults: AgentLlmMessage['toolResults'] = []
    lastToolSummaries = []

    for (const call of toolCalls) {
      if (input.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }

      const canonical = fromLlmToolName(call.name, availableTools)
      if (!canonical) {
        const summary = `Unknown tool: ${call.name}`
        toolResults.push({ name: call.name, result: { ok: false, error: summary } })
        lastToolSummaries.push(`${call.name}: ${summary}`)
        emitStatus(input.onEvent, 'Unknown tool', `Skipped unrecognized tool “${call.name}”.`)
        input.onEvent({
          type: 'message',
          message: { id: uid(), kind: 'tool', name: call.name, args: call.args, ok: false, summary, createdAt: Date.now() },
        })
        continue
      }

      const toolMeta = availableTools.find((tool) => tool.name === canonical)
      if (shouldConfirmTool(toolMeta, prefs)) {
        emitStatus(input.onEvent, 'Waiting for confirmation…', `Confirm whether to run “${canonical}”.`)
        const ok = window.confirm(`Execute tool "${canonical}"?\n\n${JSON.stringify(call.args, null, 2)}`)
        if (!ok) {
          const summary = 'Cancelled by user.'
          toolResults.push({ name: call.name, result: { ok: false, cancelled: true } })
          lastToolSummaries.push(`${canonical}: ${summary}`)
          emitStatus(input.onEvent, 'Tool cancelled', `You cancelled “${canonical}”.`)
          input.onEvent({
            type: 'message',
            message: { id: uid(), kind: 'tool', name: canonical, args: call.args, ok: false, summary, createdAt: Date.now() },
          })
          continue
        }
      }

      emitStatus(input.onEvent, `Running ${canonical}…`, `Calling WebMCP tool “${canonical}”.`)
      try {
        const result = await executeToolForTab(input.tabId, canonical, call.args)
        const summary = typeof result === 'string' ? result : JSON.stringify(result)
        toolResults.push({ name: call.name, result })
        lastToolSummaries.push(`${canonical}:\n${summary}`)
        emitStatus(input.onEvent, `${canonical} done`, `Tool “${canonical}” returned a result.`)
        input.onEvent({
          type: 'message',
          message: { id: uid(), kind: 'tool', name: canonical, args: call.args, ok: true, summary, createdAt: Date.now() },
        })
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error)
        toolResults.push({ name: call.name, result: { ok: false, error: summary } })
        lastToolSummaries.push(`${canonical}: ${summary}`)
        emitStatus(input.onEvent, `${canonical} failed`, `Tool “${canonical}” failed: ${summary}`)
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

    emitStatus(input.onEvent, 'Refreshing tools…', 'Re-listing WebMCP tools before the next model turn.')
    availableTools = filterToolsForAgent((await listToolsForTab(input.tabId)).tools, prefs)
  }

  emitStatus(input.onEvent, 'Stopping…', 'Reached the maximum number of tool rounds for this turn.')
  input.onEvent({ type: 'error', message: 'Reached maximum tool rounds.' })
  input.onEvent({ type: 'done' })
}

function truncateToolSummary(summary: string, maxChars = 4_000): string {
  if (summary.length <= maxChars) {
    return summary
  }
  return `${summary.slice(0, maxChars)}…`
}
