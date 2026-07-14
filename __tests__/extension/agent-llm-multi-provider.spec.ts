import { isValidApiBaseUrl, normalizeApiBaseUrl, resolveProviderApiRoot } from '@ext/shell/webmcp/agent-llm-api-root'
import { AGENT_LLM_PROVIDER_META, isAgentLlmProviderId } from '@ext/shell/webmcp/agent-llm-providers'
import { DEFAULT_AGENT_LLM_CONFIG, switchAgentLlmProvider } from '@ext/shell/webmcp/agent-types'

describe('agent-llm multi-provider', () => {
  it('should expose gemini, openai, and anthropic in provider meta', () => {
    expect(AGENT_LLM_PROVIDER_META.map((meta) => meta.id)).toEqual(['gemini', 'openai', 'anthropic'])
    expect(isAgentLlmProviderId('openai')).toBe(true)
    expect(isAgentLlmProviderId('anthropic')).toBe(true)
    expect(isAgentLlmProviderId('deepseek')).toBe(false)
  })

  it('should resolve official vs proxy roots for any provider label', () => {
    expect(normalizeApiBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1')
    expect(isValidApiBaseUrl('https://api.anthropic.com')).toBe(true)
    expect(resolveProviderApiRoot({ proxyEnabled: false, baseUrl: 'https://proxy.example' }, 'https://api.openai.com/v1', 'OpenAI')).toBe('https://api.openai.com/v1')
    expect(resolveProviderApiRoot({ proxyEnabled: true, baseUrl: 'https://proxy.example/v1/' }, 'https://api.openai.com/v1', 'OpenAI')).toBe('https://proxy.example/v1')
  })

  it('should stash gemini settings when switching to openai', () => {
    const switched = switchAgentLlmProvider(
      {
        ...DEFAULT_AGENT_LLM_CONFIG,
        apiKey: 'gem-key',
        model: 'gemini-2.0-flash',
      },
      'openai'
    )
    expect(switched.provider).toBe('openai')
    expect(switched.apiKey).toBe('')
    expect(switched.model).toBe('gpt-4o-mini')
    expect(switched.byProvider.gemini?.apiKey).toBe('gem-key')
  })
})
