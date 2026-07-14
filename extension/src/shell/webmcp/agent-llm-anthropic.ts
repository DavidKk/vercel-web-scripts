import { resolveProviderApiRoot } from './agent-llm-api-root'
import { getAgentLlmProviderMeta } from './agent-llm-providers'
import { buildAgentLlmFetchHeaders, normalizeProxyHeaders } from './agent-llm-proxy-headers'
import type { AgentLlmConfig, AgentLlmGenerateResult, AgentLlmMessage, AgentLlmModelInfo, AgentLlmToolDefinition } from './agent-types'

export const OFFICIAL_ANTHROPIC_API_ROOT = 'https://api.anthropic.com'

export const ANTHROPIC_FALLBACK_MODELS: readonly AgentLlmModelInfo[] = [
  { id: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5' },
  { id: 'claude-opus-4-5', displayName: 'Claude Opus 4.5' },
  { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' },
] as const

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

type AnthropicMessage = {
  role: 'user' | 'assistant'
  content: string | AnthropicContent[]
}

function toAnthropicPayload(messages: AgentLlmMessage[]): { system?: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = []
  const out: AnthropicMessage[] = []
  let pendingToolCalls: Array<{ name: string; id: string }> = []

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.text?.trim()) {
        systemParts.push(message.text.trim())
      }
      continue
    }

    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text ?? '' })
      continue
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      pendingToolCalls = message.toolCalls.map((call, index) => ({
        name: call.name,
        id: `toolu_${index}_${call.name}`,
      }))
      const content: AnthropicContent[] = []
      if (message.text?.trim()) {
        content.push({ type: 'text', text: message.text })
      }
      for (let index = 0; index < message.toolCalls.length; index += 1) {
        const call = message.toolCalls[index]!
        content.push({
          type: 'tool_use',
          id: pendingToolCalls[index]!.id,
          name: call.name,
          input: call.args ?? {},
        })
      }
      out.push({ role: 'assistant', content })
    } else if (message.text) {
      out.push({ role: 'assistant', content: message.text })
    }

    if (message.toolResults && message.toolResults.length > 0) {
      const content: AnthropicContent[] = message.toolResults.map((result) => {
        const matchIndex = pendingToolCalls.findIndex((item) => item.name === result.name)
        const toolUseId = matchIndex >= 0 ? pendingToolCalls.splice(matchIndex, 1)[0]!.id : `toolu_unknown_${result.name}`
        return {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result ?? null),
        }
      })
      out.push({ role: 'user', content })
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: out,
  }
}

function toAnthropicTools(tools: AgentLlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    input_schema: tool.parameters ?? { type: 'object', properties: {} },
  }))
}

function parseAnthropicResponse(data: {
  content?: Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }>
  error?: { message?: string }
}): AgentLlmGenerateResult {
  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const textParts: string[] = []
  const toolCalls: NonNullable<AgentLlmGenerateResult['toolCalls']> = []

  for (const block of data.content ?? []) {
    if (block.type === 'text' && block.text) {
      textParts.push(block.text)
    }
    if (block.type === 'tool_use' && block.name) {
      toolCalls.push({
        name: block.name,
        args: block.input ?? {},
      })
    }
  }

  return {
    requestId: crypto.randomUUID(),
    content: textParts.join('\n').trim() || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}

function resolveAnthropicRoot(config: Pick<AgentLlmConfig, 'proxyEnabled' | 'baseUrl'>): string {
  return resolveProviderApiRoot(config, OFFICIAL_ANTHROPIC_API_ROOT, 'Claude')
}

function buildAnthropicHeaders(config: Pick<AgentLlmConfig, 'apiKey' | 'proxyEnabled' | 'proxyHeaders'>, contentType?: string): Record<string, string> {
  return buildAgentLlmFetchHeaders({
    proxyEnabled: config.proxyEnabled,
    proxyHeaders: config.proxyHeaders,
    contentType,
    authHeaders: {
      'x-api-key': config.apiKey.trim(),
      'anthropic-version': '2023-06-01',
    },
  })
}

/**
 * Call Anthropic Messages API.
 * @param input Request payload + active config
 * @returns Normalized generate result
 */
export async function generateAnthropicAgentLlmResponse(input: {
  requestId: string
  messages: AgentLlmMessage[]
  tools?: AgentLlmToolDefinition[]
  config: AgentLlmConfig
}): Promise<AgentLlmGenerateResult> {
  const apiKey = input.config.apiKey.trim()
  if (!apiKey) {
    throw new Error('Claude API key is not configured. Open Agent settings in the side panel.')
  }

  const meta = getAgentLlmProviderMeta('anthropic')
  const model = input.config.model || meta.defaultModel
  const root = resolveAnthropicRoot(input.config)
  const { system, messages } = toAnthropicPayload(input.messages)
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    temperature: 0.4,
    messages,
  }
  if (system) {
    body.system = system
  }
  if (input.tools && input.tools.length > 0) {
    body.tools = toAnthropicTools(input.tools)
  }

  const response = await fetch(`${root}/v1/messages`, {
    method: 'POST',
    headers: buildAnthropicHeaders(input.config, 'application/json'),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Claude API error: ${response.status} ${errorText}`)
  }

  const data = (await response.json()) as Parameters<typeof parseAnthropicResponse>[0]
  const parsed = parseAnthropicResponse(data)
  return { ...parsed, requestId: input.requestId }
}

/**
 * List Anthropic models; falls back to a curated list when the API is unavailable.
 * @param config Active / override config slice
 * @returns Model options for the picker
 */
export async function listAnthropicAgentModels(config: Pick<AgentLlmConfig, 'apiKey' | 'proxyEnabled' | 'baseUrl' | 'proxyHeaders'>): Promise<AgentLlmModelInfo[]> {
  const apiKey = config.apiKey.trim()
  if (!apiKey) {
    throw new Error('Claude API key is not configured.')
  }

  const root = resolveAnthropicRoot(config)
  try {
    const response = await fetch(`${root}/v1/models?limit=100`, {
      headers: buildAnthropicHeaders({ ...config, proxyHeaders: normalizeProxyHeaders(config.proxyHeaders) }),
    })
    if (!response.ok) {
      return [...ANTHROPIC_FALLBACK_MODELS]
    }

    const data = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string }>
      error?: { message?: string }
    }
    if (data.error?.message) {
      return [...ANTHROPIC_FALLBACK_MODELS]
    }

    const models: AgentLlmModelInfo[] = []
    for (const item of data.data ?? []) {
      const id = String(item.id ?? '').trim()
      if (!id || !id.startsWith('claude')) {
        continue
      }
      models.push({
        id,
        displayName: String(item.display_name ?? id).trim() || id,
      })
    }

    models.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
    return models.length > 0 ? models : [...ANTHROPIC_FALLBACK_MODELS]
  } catch {
    return [...ANTHROPIC_FALLBACK_MODELS]
  }
}
