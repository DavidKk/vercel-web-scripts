import { buildVwsWebMcpCanonicalName, classifyWebMcpToolProvider, isValidVwsWebMcpLocalName, parseVwsWebMcpCanonicalName, VWS_WEBMCP_PROVIDER_ID } from '@shared/webmcp'

describe('webmcp naming', () => {
  it('should accept valid local tool names', () => {
    expect(isValidVwsWebMcpLocalName('toggle_danmaku')).toBe(true)
    expect(isValidVwsWebMcpLocalName('a')).toBe(true)
  })

  it('should reject local names with dots or vws prefix', () => {
    expect(isValidVwsWebMcpLocalName('vws.foo')).toBe(false)
    expect(isValidVwsWebMcpLocalName('toggle.danmaku')).toBe(false)
    expect(isValidVwsWebMcpLocalName('Toggle')).toBe(false)
  })

  it('should build and parse canonical names', () => {
    const canonical = buildVwsWebMcpCanonicalName('abc123', 'toggle_danmaku')
    expect(canonical).toBe('vws.abc123.toggle_danmaku')
    expect(parseVwsWebMcpCanonicalName(canonical)).toEqual({ scriptKey: 'abc123', localName: 'toggle_danmaku' })
  })
})

describe('webmcp provider', () => {
  it('should classify registry tools as magickmonkey', () => {
    const registry = new Map([
      [
        'vws.key.toggle',
        {
          providerId: VWS_WEBMCP_PROVIDER_ID,
          canonicalName: 'vws.key.toggle',
          localName: 'toggle',
          scriptKey: 'key',
          scriptFile: 'demo.ts',
          description: 'demo',
          readOnlyHint: false,
          registeredAt: 1,
        },
      ],
    ])
    expect(classifyWebMcpToolProvider('vws.key.toggle', registry)).toBe('magickmonkey')
    expect(classifyWebMcpToolProvider('checkout', registry)).toBe('native')
    expect(classifyWebMcpToolProvider('vws.key.missing', registry)).toBe('unknown')
    expect(classifyWebMcpToolProvider('vws.page.snapshot', registry)).toBe('magickmonkey')
    expect(classifyWebMcpToolProvider('vws.page.outline')).toBe('magickmonkey')
  })
})
