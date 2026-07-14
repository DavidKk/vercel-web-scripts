import { parseGeminiResponse, readGeminiThoughtSignature, toGeminiContents } from '@ext/shell/webmcp/agent-llm-gemini-messages'

describe('agent-llm-gemini-messages', () => {
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
})
