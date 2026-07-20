import type { AgentLlmConfig } from '@ext/shell/webmcp/agent-types'
import { loadAgentLlmConfig, updateAgentLlmConfig } from '@ext/ui/sidepanel/agent-storage'

describe('updateAgentLlmConfig write queue', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome

  beforeEach(() => {
    const store: Record<string, unknown> = {}
    ;(globalThis as { chrome?: unknown }).chrome = {
      storage: {
        local: {
          get: jest.fn(async (key: string) => ({ [key]: store[key] })),
          set: jest.fn(async (values: Record<string, unknown>) => {
            Object.assign(store, values)
          }),
        },
      },
    }
  })

  afterEach(() => {
    ;(globalThis as { chrome?: unknown }).chrome = originalChrome
  })

  it('should serialize concurrent updates so later writes see earlier results', async () => {
    await updateAgentLlmConfig((current) => ({ ...current, apiKey: 'key-1', model: 'm1' }))

    const first = updateAgentLlmConfig(async (current) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { ...current, apiKey: 'key-2' }
    })
    const second = updateAgentLlmConfig((current) => ({ ...current, model: 'm2' }))

    await Promise.all([first, second])

    const saved = await loadAgentLlmConfig()
    expect(saved.apiKey).toBe('key-2')
    expect(saved.model).toBe('m2')
  })

  it('should apply mutator against the latest stored config', async () => {
    await updateAgentLlmConfig(
      (current) =>
        ({
          ...current,
          provider: 'openai',
          apiKey: 'oai',
          model: 'gpt',
        }) as AgentLlmConfig
    )
    const next = await updateAgentLlmConfig((current) => ({ ...current, model: 'gpt-better' }))
    expect(next.provider).toBe('openai')
    expect(next.apiKey).toBe('oai')
    expect(next.model).toBe('gpt-better')
  })
})
