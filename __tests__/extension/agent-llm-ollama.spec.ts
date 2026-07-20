import { OLLAMA_DEFAULT_API_ROOT, withOllamaOpenAiCompatConfig } from '@ext/shell/webmcp/agent-llm-ollama'
import { defaultAgentLlmProviderSettings, isAgentLlmProviderId } from '@ext/shell/webmcp/agent-llm-providers'
import { DEFAULT_AGENT_LLM_CONFIG } from '@ext/shell/webmcp/agent-types'

describe('agent-llm-ollama', () => {
  it('recognizes ollama provider id and defaults proxy to local /v1', () => {
    expect(isAgentLlmProviderId('ollama')).toBe(true)
    const defaults = defaultAgentLlmProviderSettings('ollama')
    expect(defaults.proxyEnabled).toBe(true)
    expect(defaults.baseUrl).toBe(OLLAMA_DEFAULT_API_ROOT)
  })

  it('does not require an API key for ollama', async () => {
    const { agentLlmProviderNeedsApiKey } = await import('@ext/shell/webmcp/agent-llm-providers')
    expect(agentLlmProviderNeedsApiKey('ollama')).toBe(false)
    expect(agentLlmProviderNeedsApiKey('gemini')).toBe(true)
  })

  it('fills default root and does not invent a dummy api key', () => {
    const resolved = withOllamaOpenAiCompatConfig({
      ...DEFAULT_AGENT_LLM_CONFIG,
      provider: 'ollama',
      proxyEnabled: false,
      baseUrl: '',
      apiKey: '',
      proxyHeaders: { Authorization: 'Bearer leftover-from-proxy' },
    })
    expect(resolved.proxyEnabled).toBe(true)
    expect(resolved.baseUrl).toBe(OLLAMA_DEFAULT_API_ROOT)
    expect(resolved.apiKey).toBe('')
    expect(resolved.proxyHeaders.Authorization).toBeUndefined()
  })
})
