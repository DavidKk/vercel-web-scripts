import { buildRegistryMapFromProbeEntries, buildWebMcpSupportHints, buildWebMcpSupportPayloadFromProbe, isOperableHttpTabUrl } from '@ext/shell/webmcp/webmcp-support'

describe('webmcp-support', () => {
  it('isOperableHttpTabUrl accepts http(s) only', () => {
    expect(isOperableHttpTabUrl('https://example.com')).toBe(true)
    expect(isOperableHttpTabUrl('http://localhost:3000')).toBe(true)
    expect(isOperableHttpTabUrl('chrome://extensions')).toBe(false)
    expect(isOperableHttpTabUrl(undefined)).toBe(false)
  })

  it('buildWebMcpSupportPayloadFromProbe maps secure context failures', () => {
    const payload = buildWebMcpSupportPayloadFromProbe({
      ok: false,
      reason: 'no_secure_context',
      details: { isSecure: false, origin: 'http://example.com', hasTesting: false, hasListTools: false },
      registryEntries: [],
    })
    expect(payload.supported).toBe(false)
    expect(payload.reason).toBe('no_secure_context')
    expect(payload.hints.length).toBeGreaterThan(0)
  })

  it('buildRegistryMapFromProbeEntries keeps magickmonkey rows only', () => {
    const map = buildRegistryMapFromProbeEntries([
      { name: 'vws.demo.toggle', providerId: 'magickmonkey', scriptKey: 'demo', localName: 'toggle' },
      { name: 'site.native', providerId: 'other' },
    ])
    expect(map.size).toBe(1)
    expect(map.get('vws.demo.toggle')?.scriptKey).toBe('demo')
  })

  it('buildWebMcpSupportHints returns api flag guidance', () => {
    const hints = buildWebMcpSupportHints('api_missing')
    expect(hints.join(' ')).toContain('enable-webmcp-testing')
  })
})
