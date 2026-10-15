import {
  buildGeminiGenerationConfig,
  parseGeminiResponse,
  readGeminiThoughtSignature,
  sanitizeGeminiFunctionParameters,
  summarizeGeminiResponseForLog,
  toGeminiContents,
  toGeminiToolDeclarations,
} from '@ext/shell/webmcp/agent-llm-gemini-messages'

describe('agent-llm-gemini-messages', () => {
  it('should disable thinking for gemini-2.5-flash and raise maxOutputTokens', () => {
    expect(buildGeminiGenerationConfig('gemini-2.5-flash')).toEqual({
      temperature: 0.4,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 0 },
    })
  })

  it('should keep a small thinking budget for gemini-2.5-pro', () => {
    expect(buildGeminiGenerationConfig('gemini-2.5-pro')).toEqual({
      temperature: 0.4,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 1024 },
    })
  })

  it('should omit thinkingConfig for older non-thinking flash models', () => {
    expect(buildGeminiGenerationConfig('gemini-2.0-flash')).toEqual({
      temperature: 0.4,
      maxOutputTokens: 16384,
    })
  })

  it('should strip additionalProperties from Gemini function parameters', () => {
    expect(
      sanitizeGeminiFunctionParameters({
        type: 'object',
        properties: { index: { type: 'integer', minimum: 0, default: 0 } },
        additionalProperties: false,
      })
    ).toEqual({
      type: 'object',
      properties: { index: { type: 'integer', minimum: 0 } },
    })
  })

  it('should sanitize tool parameters in toGeminiToolDeclarations', () => {
    const declarations = toGeminiToolDeclarations([
      {
        name: 'vws__page__outline',
        description: 'outline',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    ])
    expect(declarations[0]?.parameters).toEqual({ type: 'object', properties: {} })
  })

  it('should throw proxy envelope errors when success is false', () => {
    expect(() =>
      parseGeminiResponse({
        success: false,
        message: 'Proxy failed with status code 400. reason: additionalProperties',
      })
    ).toThrow(/Proxy failed with status code 400/)
  })

  it('should throw a clear error when MAX_TOKENS returns no content after thinking', () => {
    expect(() =>
      parseGeminiResponse({
        candidates: [{ finishReason: 'MAX_TOKENS' }],
        usageMetadata: { thoughtsTokenCount: 4096 },
      })
    ).toThrow(/hit maxOutputTokens while thinking \(4096 thought tokens\)/)
  })

  it('should attach emptyReason when the candidate has no text or tool calls', () => {
    const parsed = parseGeminiResponse({
      candidates: [
        {
          finishReason: 'STOP',
          content: { parts: [{ thoughtSignature: 'sig-only' }] },
        },
      ],
      usageMetadata: { thoughtsTokenCount: 12 },
    })
    expect(parsed.content).toBeUndefined()
    expect(parsed.toolCalls).toBeUndefined()
    expect(parsed.emptyReason).toContain('finishReason=STOP')
    expect(parsed.emptyReason).toContain('thoughtSignature')
  })

  it('should summarize Gemini responses for logs without dumping long text', () => {
    expect(
      summarizeGeminiResponseForLog({
        candidates: [
          {
            finishReason: 'STOP',
            content: { parts: [{ text: 'hello world' }, { functionCall: { name: 'vws__x', args: {} } }] },
          },
        ],
        usageMetadata: { thoughtsTokenCount: 3 },
      })
    ).toContain('"parts":["text:11","functionCall:vws__x"]')
  })

  it('should read thoughtSignature from camelCase or snake_case parts', () => {
    expect(readGeminiThoughtSignature({ thoughtSignature: 'abc' })).toBe('abc')
    expect(readGeminiThoughtSignature({ thought_signature: 'def' })).toBe('def')
    expect(readGeminiThoughtSignature({ text: 'hi' })).toBeUndefined()
  })

  it('should parse functionCall thought signatures from Gemini responses', () => {
    const parsed = parseGeminiResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: { name: 'vws__list_tools', args: {} },
                thoughtSignature: 'sig-1',
              },
            ],
          },
        },
      ],
    })
    expect(parsed.toolCalls?.[0]).toEqual({
      name: 'vws__list_tools',
      args: {},
      thoughtSignature: 'sig-1',
    })
  })

  it('should echo thoughtSignature on model functionCall parts in history', () => {
    const contents = toGeminiContents([
      {
        role: 'model',
        toolCalls: [
          {
            name: 'vws__list_tools',
            args: { q: 1 },
            thoughtSignature: 'sig-roundtrip',
          },
        ],
      },
    ])
    expect(contents[0]).toEqual({
      role: 'model',
      parts: [
        {
          functionCall: { name: 'vws__list_tools', args: { q: 1 } },
          thoughtSignature: 'sig-roundtrip',
        },
      ],
    })
  })

  it('should flatten object tool results into functionResponse.response', () => {
    const contents = toGeminiContents([
      {
        role: 'model',
        toolResults: [{ name: 'vws__page__outline', result: { ok: true, h1Count: 1 } }],
      },
    ])
    expect(contents[0]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'vws__page__outline',
            response: { ok: true, h1Count: 1 },
          },
        },
      ],
    })
  })
})
