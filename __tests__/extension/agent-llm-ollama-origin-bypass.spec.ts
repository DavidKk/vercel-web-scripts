import {
  buildOllamaOriginBypassRules,
  ensureOllamaOriginBypassRules,
  getOllamaOriginBypassCustomRuleIdForTests,
  getOllamaOriginBypassRuleIdForTests,
  isOllamaOriginBypassHost,
  resetOllamaOriginBypassInstallForTests,
} from '@ext/shell/webmcp/agent-llm-ollama-origin-bypass'

describe('agent-llm-ollama-origin-bypass', () => {
  let updateDynamicRules: jest.Mock

  beforeEach(() => {
    resetOllamaOriginBypassInstallForTests()
    updateDynamicRules = jest.fn(async () => undefined)
    ;(global as { chrome?: unknown }).chrome = {
      runtime: { id: 'test-extension-id' },
      declarativeNetRequest: {
        updateDynamicRules,
        RuleActionType: { MODIFY_HEADERS: 'modifyHeaders' },
        HeaderOperation: { REMOVE: 'remove' },
        ResourceType: { XMLHTTPREQUEST: 'xmlhttprequest', OTHER: 'other' },
      },
    }
  })

  it('uses stable declarativeNetRequest rule ids', () => {
    expect(getOllamaOriginBypassRuleIdForTests()).toBe(91_434)
    expect(getOllamaOriginBypassCustomRuleIdForTests()).toBe(91_435)
  })

  it('matches any loopback port from this extension only', () => {
    const [loopback] = buildOllamaOriginBypassRules()
    expect(loopback.condition.initiatorDomains).toEqual(['test-extension-id'])
    expect(loopback.condition.regexFilter).toMatch(/127\\.0\\.0\\.1.*localhost/)
    expect(loopback.condition.regexFilter).toContain('(?::\\d+)?')
    expect(loopback.action.requestHeaders).toEqual(
      expect.arrayContaining([expect.objectContaining({ header: 'origin', operation: 'remove' }), expect.objectContaining({ header: 'referer', operation: 'remove' })])
    )
  })

  it('adds a LAN host:port rule for private Base URLs', () => {
    const rules = buildOllamaOriginBypassRules('http://192.168.1.10:11435/v1')
    expect(rules).toHaveLength(2)
    expect(rules[1].id).toBe(91_435)
    expect(rules[1].condition.regexFilter).toContain('192\\.168\\.1\\.10')
    expect(rules[1].condition.regexFilter).toContain('11435')
  })

  it('allows omitted default ports for LAN Base URLs', () => {
    const rules = buildOllamaOriginBypassRules('http://192.168.1.10/v1')
    expect(rules).toHaveLength(2)
    expect(rules[1].condition.regexFilter).toBe('^https?://192\\.168\\.1\\.10(?::80)?(?:/.*)?$')
  })

  it('does not add a custom rule for public hosts', () => {
    expect(isOllamaOriginBypassHost('api.example.com')).toBe(false)
    expect(buildOllamaOriginBypassRules('https://api.example.com/v1')).toHaveLength(1)
  })

  it('classifies loopback and RFC1918 hosts', () => {
    expect(isOllamaOriginBypassHost('127.0.0.1')).toBe(true)
    expect(isOllamaOriginBypassHost('::1')).toBe(true)
    expect(isOllamaOriginBypassHost('10.0.0.2')).toBe(true)
    expect(isOllamaOriginBypassHost('172.16.5.1')).toBe(true)
    expect(isOllamaOriginBypassHost('172.15.0.1')).toBe(false)
  })

  it('serializes concurrent installs and ends on the latest Base URL', async () => {
    let releaseFirst!: () => void
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    updateDynamicRules
      .mockImplementationOnce(async () => {
        await firstBlocked
      })
      .mockImplementation(async () => undefined)

    const first = ensureOllamaOriginBypassRules('http://192.168.1.10:11434/v1')
    await Promise.resolve()
    expect(updateDynamicRules).toHaveBeenCalledTimes(1)

    const second = ensureOllamaOriginBypassRules('http://192.168.1.11:11435/v1')
    releaseFirst()
    await Promise.all([first, second])

    expect(updateDynamicRules.mock.calls.length).toBeGreaterThanOrEqual(2)
    const lastRules = updateDynamicRules.mock.calls.at(-1)?.[0]?.addRules ?? []
    expect(lastRules.some((rule: { condition?: { regexFilter?: string } }) => rule.condition?.regexFilter?.includes('192\\.168\\.1\\.11'))).toBe(true)
  })
})
