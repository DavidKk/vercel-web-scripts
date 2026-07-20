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

/**
 * Map Agent tool definitions to Gemini functionDeclarations.
 * @param tools Tool definitions
 * @returns Gemini tool declaration objects
 */
export function toGeminiToolDeclarations(tools: AgentLlmToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parameters: tool.parameters ?? { type: 'object', properties: {} },
  }))
}

/**
 * Parse a Gemini generateContent response into the Agent LLM result shape.
 * @param data Raw JSON body from Gemini
 * @returns Normalized generate result (requestId placeholder UUID)
 */
export function parseGeminiResponse(data: { candidates?: Array<{ content?: { parts?: GeminiPart[] } }>; error?: { message?: string } }): AgentLlmGenerateResult {
  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const parts = data.candidates?.[0]?.content?.parts ?? []
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

  return {
    requestId: crypto.randomUUID(),
    content: textParts.join('\n').trim() || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  }
}
