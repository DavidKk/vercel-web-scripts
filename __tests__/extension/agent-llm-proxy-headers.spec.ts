import { buildAgentLlmFetchHeaders, formatProxyHeadersJson, normalizeProxyHeaders, parseProxyHeadersJson } from '@ext/shell/webmcp/agent-llm-proxy-headers'

describe('agent-llm-proxy-headers', () => {
  it('should normalize header keys and stringify values', () => {
    expect(
      normalizeProxyHeaders({
        ' Authorization ': 'Bearer x',
        'X-Custom': 1,
        '': 'skip',
        empty: null,
      })
    ).toEqual({
      Authorization: 'Bearer x',
      'X-Custom': '1',
    })
  })

  it('should parse JSON object headers and reject arrays', () => {
    expect(parseProxyHeadersJson('{"Authorization":"Bearer t"}')).toEqual({ Authorization: 'Bearer t' })
    expect(parseProxyHeadersJson('')).toEqual({})
    expect(() => parseProxyHeadersJson('[]')).toThrow(/JSON object/i)
    expect(() => parseProxyHeadersJson('{')).toThrow(/JSON object/i)
  })

  it('should format headers as pretty JSON', () => {
    expect(formatProxyHeadersJson({ Authorization: 'Bearer t' })).toContain('"Authorization"')
  })

  it('should apply custom headers only when proxy is enabled', () => {
    expect(
      buildAgentLlmFetchHeaders({
        proxyEnabled: false,
        proxyHeaders: { Authorization: 'Bearer t' },
        contentType: 'application/json',
        authHeaders: { Authorization: 'Bearer real' },
      })
    ).toEqual({ Authorization: 'Bearer real', 'Content-Type': 'application/json' })

    expect(
      buildAgentLlmFetchHeaders({
        proxyEnabled: true,
        proxyHeaders: { Authorization: 'Bearer t', 'X-Foo': 'bar' },
        contentType: 'application/json',
        authHeaders: { Authorization: 'Bearer real' },
      })
    ).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer t',
      'X-Foo': 'bar',
    })
  })
})
