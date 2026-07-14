import {
  buildGeminiGenerateContentUrl,
  buildGeminiListModelsUrl,
  isValidGeminiBaseUrl,
  normalizeGeminiBaseUrl,
  OFFICIAL_GEMINI_API_ROOT,
  resolveGeminiApiRoot,
} from '@ext/shell/webmcp/agent-llm-gemini-url'

describe('agent-llm-gemini-url', () => {
  it('should strip trailing slashes when normalizing base URL', () => {
    expect(normalizeGeminiBaseUrl(' https://proxy.example/v1/ ')).toBe('https://proxy.example/v1')
    expect(normalizeGeminiBaseUrl('https://proxy.example///')).toBe('https://proxy.example')
  })

  it('should accept http(s) URLs and reject invalid input', () => {
    expect(isValidGeminiBaseUrl('https://proxy.example')).toBe(true)
    expect(isValidGeminiBaseUrl('http://localhost:8787')).toBe(true)
    expect(isValidGeminiBaseUrl('')).toBe(false)
    expect(isValidGeminiBaseUrl('not-a-url')).toBe(false)
    expect(isValidGeminiBaseUrl('ftp://proxy.example')).toBe(false)
  })

  it('should use official root when proxy is disabled even if baseUrl is set', () => {
    expect(
      resolveGeminiApiRoot({
        proxyEnabled: false,
        baseUrl: 'https://proxy.example',
      })
    ).toBe(OFFICIAL_GEMINI_API_ROOT)
  })

  it('should use custom root when proxy is enabled with a valid baseUrl', () => {
    expect(
      resolveGeminiApiRoot({
        proxyEnabled: true,
        baseUrl: 'https://proxy.example/',
      })
    ).toBe('https://proxy.example')
  })

  it('should throw when proxy is enabled with an empty or invalid baseUrl', () => {
    expect(() => resolveGeminiApiRoot({ proxyEnabled: true, baseUrl: '' })).toThrow(/Base URL/i)
    expect(() => resolveGeminiApiRoot({ proxyEnabled: true, baseUrl: 'bad' })).toThrow(/Base URL/i)
  })

  it('should build generateContent and list models URLs with key query', () => {
    const root = 'https://proxy.example'
    const generateUrl = buildGeminiGenerateContentUrl(root, 'gemini-2.0-flash', 'secret-key')
    expect(generateUrl).toBe('https://proxy.example/v1beta/models/gemini-2.0-flash:generateContent?key=secret-key')

    const listUrl = buildGeminiListModelsUrl(root, 'secret-key', 'tok')
    expect(listUrl).toContain('https://proxy.example/v1beta/models?')
    expect(listUrl).toContain('key=secret-key')
    expect(listUrl).toContain('pageToken=tok')
    expect(listUrl).toContain('pageSize=100')
  })
})
