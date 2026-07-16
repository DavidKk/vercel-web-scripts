import { DEFAULT_AGENT_LLM_CONFIG, switchAgentLlmProvider, syncActiveProviderIntoByProvider } from '@ext/shell/webmcp/agent-types'

describe('agent-llm provider config', () => {
  it('should default to an empty model (no hardcoded pick)', () => {
    expect(DEFAULT_AGENT_LLM_CONFIG.model).toBe('')
    expect(DEFAULT_AGENT_LLM_CONFIG.byProvider.gemini?.model).toBe('')
  })

  it('should stash active settings into byProvider on sync', () => {
    const synced = syncActiveProviderIntoByProvider({
      ...DEFAULT_AGENT_LLM_CONFIG,
      apiKey: 'k1',
      model: 'gemini-2.0-flash',
      proxyEnabled: true,
      baseUrl: 'https://proxy.example',
    })
    expect(synced.byProvider.gemini).toEqual({
      apiKey: 'k1',
      model: 'gemini-2.0-flash',
      proxyEnabled: true,
      baseUrl: 'https://proxy.example',
      proxyHeaders: {},
    })
  })

  it('should keep the same provider when switching to itself', () => {
    const config = {
      ...DEFAULT_AGENT_LLM_CONFIG,
      apiKey: 'k1',
    }
    const next = switchAgentLlmProvider(config, 'gemini')
    expect(next.provider).toBe('gemini')
    expect(next.apiKey).toBe('k1')
    expect(next.byProvider.gemini?.apiKey).toBe('k1')
  })
})
