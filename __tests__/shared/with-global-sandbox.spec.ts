import { buildWithGlobalExecutionSandbox, readBoundProxyTargetProperty } from '@shared/with-global-sandbox'

describe('with-global-sandbox', () => {
  it('buildWithGlobalExecutionSandbox keeps injected APIs but drops native builtins', () => {
    const host: Record<string, unknown> = {
      GME_ok: () => 'ok',
      __BASE_URL__: 'https://example.com',
      getComputedStyle: () => 'shadowed',
      document: { querySelector: () => null },
    }
    const sandbox = buildWithGlobalExecutionSandbox(host, { __IS_REMOTE_EXECUTE__: true })

    expect(sandbox.GME_ok).toBe(host.GME_ok)
    expect(sandbox.__BASE_URL__).toBe('https://example.com')
    expect(sandbox.__IS_REMOTE_EXECUTE__).toBe(true)
    expect('getComputedStyle' in sandbox).toBe(false)
    expect('document' in sandbox).toBe(false)
  })

  it('readBoundProxyTargetProperty binds functions to the real target', () => {
    const target = {
      value: 1,
      needsThis() {
        // Unbound calls may yield undefined `this` (strict) or a wrong receiver.
        if (this == null || (this as { value?: number }).value !== 1) {
          throw new TypeError('Illegal invocation')
        }
        return 'ok'
      },
    }

    const bad = Reflect.get(target, 'needsThis', new Proxy(target, {}))
    expect(() => (bad as () => string)()).toThrow('Illegal invocation')

    const bound = readBoundProxyTargetProperty(target, 'needsThis') as () => string
    expect(bound()).toBe('ok')
  })
})
