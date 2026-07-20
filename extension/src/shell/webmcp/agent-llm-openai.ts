import { resolveProviderApiRoot } from './agent-llm-api-root'
import { buildAgentLlmFetchHeaders, normalizeProxyHeaders } from './agent-llm-proxy-headers'
import type { AgentLlmConfig, AgentLlmGenerateResult, AgentLlmMessage, AgentLlmModelInfo, AgentLlmToolDefinition } from './agent-types'

export const OFFICIAL_OPENAI_API_ROOT = 'https://api.openai.com/v1'

type OpenAiChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] } | { role: 'tool'; tool_call_id: string; content: string }

type OpenAiToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

function toOpenAiMessages(messages: AgentLlmMessage[]): OpenAiChatMessage[] {
  const out: OpenAiChatMessage[] = []
  let pendingToolCalls: Array<{ name: string; id: string }> = []

  for (const message of messages) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: message.text ?? '' })
      continue
    }

    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text ?? '' })
      continue
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      pendingToolCalls = message.toolCalls.map((call, index) => ({
        name: call.name,
        id: `call_${index}_${call.name}`,
      }))
      out.push({
        role: 'assistant',
        content: message.text?.trim() ? message.text : null,
        tool_calls: message.toolCalls.map((call, index) => ({
          id: pendingToolCalls[index]!.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.args ?? {}),
          },
        })),
      })
    } else if (message.text) {
      out.push({ role: 'assistant', content: message.text })
    }

    if (message.toolResults && message.toolResults.length > 0) {
      for (const result of message.toolResults) {
        const matchIndex = pendingToolCalls.findIndex((item) => item.name === result.name)
        const toolCallId = matchIndex >= 0 ? pendingToolCalls.splice(matchIndex, 1)[0]!.id : `call_unknown_${result.name}`
        out.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result ?? null),
        })
      }
    }
  }

  return out
}

function toOpenAiTools(tools: AgentLlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.parameters ?? { type: 'object', properties: {} },
    },
  }))
}

function parseOpenAiResponse(data: {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
    }
  }>
  error?: { message?: string }
}): AgentLlmGenerateResult {
  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const message = data.choices?.[0]?.message
  const content = String(message?.content ?? '').trim() || undefined
  const toolCalls: NonNullable<AgentLlmGenerateResult['toolCalls']> = []

  for (const call of message?.tool_calls ?? []) {
    const name = String(call.function?.name ?? '').trim()
    if (!name) {
      continue
    }
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(String(call.function?.arguments ?? '{}')) as Record<string, unknown>
    } catch {
      args = {}
    }
    toolCalls.push({ name, args })
  }

  return {
    requestId: crypto.randomUUID(),
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}

function resolveOpenAiRoot(config: Pick<AgentLlmConfig, 'proxyEnabled' | 'baseUrl'>): string {
  return resolveProviderApiRoot(config, OFFICIAL_OPENAI_API_ROOT, 'OpenAI')
}

function buildOpenAiHeaders(config: Pick<AgentLlmConfig, 'apiKey' | 'proxyEnabled' | 'proxyHeaders'>, contentType?: string): Record<string, string> {
  const apiKey = config.apiKey.trim()
  return buildAgentLlmFetchHeaders({
    proxyEnabled: config.proxyEnabled,
    proxyHeaders: config.proxyHeaders,
    contentType,
    // Local OpenAI-compatible servers (e.g. Ollama) often reject empty/dummy Bearer tokens.
    authHeaders: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  })
}

/**
 * Call OpenAI-compatible chat.completions.
 * @param input Request payload + active config
 * @returns Normalized generate result
 */
export async function generateOpenAiAgentLlmResponse(input: {
  requestId: string
  messages: AgentLlmMessage[]
  tools?: AgentLlmToolDefinition[]
  config: AgentLlmConfig
}): Promise<AgentLlmGenerateResult> {
  const apiKey = input.config.apiKey.trim()
  if (!input.config.proxyEnabled && !apiKey) {
    throw new Error('OpenAI API key is not configured. Open Agent settings in the side panel.')
  }

  const model = input.config.model.trim()
  if (!model) {
    throw new Error('Select a model next to Send before chatting.')
  }
  const root = resolveOpenAiRoot(input.config)
  const body: Record<string, unknown> = {
    model,
    messages: toOpenAiMessages(input.messages),
    temperature: 0.4,
  }
  if (input.tools && input.tools.length > 0) {
    body.tools = toOpenAiTools(input.tools)
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${root}/chat/completions`, {
    method: 'POST',
    headers: buildOpenAiHeaders(input.config, 'application/json'),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`OpenAI API error (${root}): ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as Parameters<typeof parseOpenAiResponse>[0]
  const parsed = parseOpenAiResponse(data)
  return { ...parsed, requestId: input.requestId }
}

/**
 * List OpenAI models (chat-oriented ids preferred).
 * @param config Active / override config slice
 * @returns Model options for the picker
 */
export async function listOpenAiAgentModels(config: Pick<AgentLlmConfig, 'apiKey' | 'proxyEnabled' | 'baseUrl' | 'proxyHeaders'>): Promise<AgentLlmModelInfo[]> {
  const apiKey = config.apiKey.trim()
  if (!config.proxyEnabled && !apiKey) {
    throw new Error('OpenAI API key is not configured.')
  }

  const root = resolveOpenAiRoot(config)
  const response = await fetch(`${root}/models`, {
    headers: buildOpenAiHeaders({ ...config, proxyHeaders: normalizeProxyHeaders(config.proxyHeaders) }),
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`OpenAI models.list failed (${root}): ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as { data?: Array<{ id?: string }>; error?: { message?: string } }
  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const models: AgentLlmModelInfo[] = []
  for (const item of data.data ?? []) {
    const id = String(item.id ?? '').trim()
    if (!id) {
      continue
    }
    if (!/^(gpt-|o[1-9]|chatgpt-)/i.test(id)) {
      continue
    }
    models.push({ id, displayName: id })
  }

  models.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
  return models
}
