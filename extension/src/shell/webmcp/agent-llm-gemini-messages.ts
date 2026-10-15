import type { AgentLlmGenerateResult, AgentLlmMessage, AgentLlmToolCall, AgentLlmToolDefinition } from './agent-types'

type GeminiFunctionCall = {
  name: string
  args: Record<string, unknown>
}

type GeminiPart = {
  text?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: { name: string; response: Record<string, unknown> }
  thoughtSignature?: string
  thought_signature?: string
}

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

/**
 * Read thought signature from a Gemini content part (camelCase or snake_case).
 * @param part Gemini part from API response or history
 * @returns Signature string when present
 */
export function readGeminiThoughtSignature(part: GeminiPart): string | undefined {
  const camel = typeof part.thoughtSignature === 'string' ? part.thoughtSignature.trim() : ''
  if (camel) {
    return camel
  }
  const snake = typeof part.thought_signature === 'string' ? part.thought_signature.trim() : ''
  return snake || undefined
}

/**
 * Convert Agent chat history into Gemini generateContent `contents`.
 * Preserves thoughtSignature on model functionCall parts for thinking models.
 * @param messages Agent LLM messages
 * @returns Gemini contents array
 */
export function toGeminiContents(messages: AgentLlmMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = []

  for (const message of messages) {
    if (message.role === 'system') {
      contents.push({
        role: 'user',
        parts: [{ text: `System:\n${message.text ?? ''}` }],
      })
      continue
    }

    if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: message.text ?? '' }],
      })
      continue
    }

    const parts: GeminiPart[] = []
    if (message.text) {
      parts.push({ text: message.text })
    }
    for (const call of message.toolCalls ?? []) {
      const part: GeminiPart = {
        functionCall: { name: call.name, args: call.args },
      }
      if (call.thoughtSignature?.trim()) {
        part.thoughtSignature = call.thoughtSignature.trim()
      }
      parts.push(part)
    }
    if (parts.length > 0) {
      contents.push({ role: 'model', parts })
    }

    for (const result of message.toolResults ?? []) {
      const payload = toGeminiFunctionResponsePayload(result.result)
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: result.name,
              response: payload,
            },
          },
        ],
      })
    }
  }

  return contents
}

/**
 * Flatten tool results into a Gemini functionResponse `response` Struct.
 * Nested `{ result: {...} }` is harder for models to answer from than the object itself.
 */
export function toGeminiFunctionResponsePayload(result: unknown): Record<string, unknown> {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, unknown>
  }
  return { result: result ?? null }
}

/** JSON Schema keys Gemini functionDeclarations.parameters reject (proto Schema subset). */
const GEMINI_PARAMETERS_STRIP_KEYS = new Set([
  'additionalProperties',
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'definitions',
  'examples',
  'default',
  'unevaluatedProperties',
  'patternProperties',
])

/**
 * Strip JSON Schema fields Gemini's function-calling Schema does not accept.
 * WebMCP / page tools often set `additionalProperties: false`, which causes Gemini 400.
 * @param schema Candidate parameters object
 * @returns Sanitized parameters object
 */
export function sanitizeGeminiFunctionParameters(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} }
  }
  return sanitizeGeminiSchemaNode(schema) as Record<string, unknown>
}

function sanitizeGeminiSchemaNode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeGeminiSchemaNode(entry))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (GEMINI_PARAMETERS_STRIP_KEYS.has(key)) {
      continue
    }
    out[key] = sanitizeGeminiSchemaNode(child)
  }
  return out
}

/**
 * Map Agent tool definitions to Gemini functionDeclarations.
 * @param tools Tool definitions
 * @returns Gemini tool declaration objects
 */
export function toGeminiToolDeclarations(tools: AgentLlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parameters: sanitizeGeminiFunctionParameters(tool.parameters ?? { type: 'object', properties: {} }),
  }))
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
  /** Some Gemini proxies return HTTP 200 with this envelope instead of Gemini `error`. */
  success?: boolean
  message?: string
  usageMetadata?: {
    thoughtsTokenCount?: number
    candidatesTokenCount?: number
    promptTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * Compact Gemini response summary for debug logs (no raw thought signatures / long text).
 * @param data Raw generateContent JSON
 * @returns Single-line summary
 */
export function summarizeGeminiResponseForLog(data: GeminiGenerateContentResponse): string {
  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const partKinds = parts.map((part) => {
    if (part.functionCall?.name) {
      return `functionCall:${part.functionCall.name}`
    }
    if (typeof part.text === 'string') {
      return `text:${part.text.length}`
    }
    if (readGeminiThoughtSignature(part)) {
      return 'thoughtSignature'
    }
    return 'other'
  })
  return JSON.stringify({
    finishReason: candidate?.finishReason ?? null,
    candidateCount: data.candidates?.length ?? 0,
    parts: partKinds,
    usage: data.usageMetadata ?? null,
    blockReason: data.promptFeedback?.blockReason ?? null,
    error: data.error?.message ?? null,
    proxySuccess: data.success ?? null,
    proxyMessage: typeof data.message === 'string' ? data.message.slice(0, 300) : null,
  })
}

/**
 * Build generateContent `generationConfig` for the selected Gemini model.
 * Gemini 2.5+ counts thinking tokens against `maxOutputTokens`; when the budget is
 * exhausted the API often returns MAX_TOKENS with no `content` (empty Agent answer).
 * @param model Selected model id
 * @returns generationConfig object for the request body
 */
export function buildGeminiGenerationConfig(model: string): Record<string, unknown> {
  const id = model.trim().toLowerCase()
  const generationConfig: Record<string, unknown> = {
    temperature: 0.4,
    // Leave headroom for answer tokens after any thinking budget.
    maxOutputTokens: 16384,
  }

  // 2.5 Flash/Flash-Lite can disable thinking; 2.5 Pro cannot (minimum budget 128).
  if (id.includes('gemini-2.5') || id.includes('gemini-3')) {
    if (id.includes('pro')) {
      generationConfig.thinkingConfig = { thinkingBudget: 1024 }
    } else {
      generationConfig.thinkingConfig = { thinkingBudget: 0 }
    }
  }

  return generationConfig
}

/**
 * Parse a Gemini generateContent response into the Agent LLM result shape.
 * @param data Raw JSON body from Gemini
 * @returns Normalized generate result (requestId placeholder UUID)
 */
export function parseGeminiResponse(data: GeminiGenerateContentResponse): AgentLlmGenerateResult {
  if (data.error?.message) {
    throw new Error(data.error.message)
  }
  // Proxies (e.g. Gemini Relay) may keep HTTP 200 and wrap upstream failures.
  if (data.success === false && typeof data.message === 'string' && data.message.trim()) {
    throw new Error(data.message.trim())
  }

  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  const textParts: string[] = []
  const toolCalls: AgentLlmToolCall[] = []

  for (const part of parts) {
    if (part.text) {
      textParts.push(part.text)
    }
    if (part.functionCall?.name) {
      const thoughtSignature = readGeminiThoughtSignature(part)
      toolCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
        ...(thoughtSignature ? { thoughtSignature } : {}),
      })
    }
  }

  const content = textParts.join('\n').trim() || undefined
  const normalizedToolCalls = toolCalls.length > 0 ? toolCalls : undefined
  const finishReason = String(candidate?.finishReason ?? '')
    .trim()
    .toUpperCase()
  const blockReason = String(data.promptFeedback?.blockReason ?? '').trim()

  if (!content && !normalizedToolCalls) {
    if (blockReason) {
      throw new Error(`Gemini blocked the prompt (${blockReason}).`)
    }
    if (!data.candidates?.length) {
      throw new Error('Gemini returned no candidates. Check admin Logs (scope AgentLLM) or the service worker console.')
    }
    if (finishReason === 'MAX_TOKENS') {
      const thoughts = data.usageMetadata?.thoughtsTokenCount
      throw new Error(
        typeof thoughts === 'number' && thoughts > 0
          ? `Gemini hit maxOutputTokens while thinking (${thoughts} thought tokens) and returned no answer. Disable or limit thinking, or raise max output tokens.`
          : 'Gemini hit maxOutputTokens and returned no answer. Disable or limit thinking, or raise max output tokens.'
      )
    }

    const partKinds = parts.map((part) => {
      if (part.functionCall?.name) {
        return `functionCall:${part.functionCall.name}`
      }
      if (typeof part.text === 'string') {
        return part.text.trim() ? `text:${part.text.length}` : 'text:empty'
      }
      if (readGeminiThoughtSignature(part)) {
        return 'thoughtSignature'
      }
      return 'other'
    })
    return {
      requestId: crypto.randomUUID(),
      content: undefined,
      toolCalls: undefined,
      emptyReason: `finishReason=${finishReason || 'none'}; parts=[${partKinds.join(',') || 'none'}]; thoughts=${data.usageMetadata?.thoughtsTokenCount ?? 0}`,
    }
  }

  return {
    requestId: crypto.randomUUID(),
    content,
    toolCalls: normalizedToolCalls,
  }
}
