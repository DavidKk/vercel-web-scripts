import {
  buildScriptPermissionRegistryKey,
  createEmptyScriptPermissionRegistry,
  normalizePermissionNetworkHost,
  parseScriptPermissionRegistryKey,
  permissionResourceMatchesUrl,
  resolvePersistentPermissionDecision,
} from '@shared/script-permission'

describe('script-permission', () => {
  it('normalizes network host from URL', () => {
    expect(normalizePermissionNetworkHost('https://Example.com:8443/path')).toBe('example.com:8443')
    expect(normalizePermissionNetworkHost('api.example.com')).toBe('api.example.com')
  })

  it('builds stable registry keys', () => {
    expect(buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'network', 'example.com')).toBe('key-a:demo.ts:network:example.com')
    expect(buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'capture-screenshot', 'example.com')).toBe('key-a:demo.ts:capture-screenshot:example.com')
  })

  it('encodes scriptKey and file segments with special characters', () => {
    const key = buildScriptPermissionRegistryKey('key:a', 'path/demo.ts', 'network', 'example.com')
    expect(key).toBe('key%3Aa:path%2Fdemo.ts:network:example.com')
    expect(parseScriptPermissionRegistryKey(key)).toEqual({
      scriptKey: 'key:a',
      file: 'path/demo.ts',
      capability: 'network',
      resource: 'example.com',
    })
  })

  it('resolves persistent allow when hash matches', () => {
    const registry = createEmptyScriptPermissionRegistry()
    const request = { scriptKey: 'key-a', file: 'demo.ts', capability: 'network' as const, resource: 'example.com', contentHash: 'hash-a' }
    registry.entries[buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)] = {
      decision: 'allow',
      remember: 'persistent',
      contentHash: 'hash-a',
      updatedAt: 1,
    }
    expect(resolvePersistentPermissionDecision(registry, request)).toBe('allow')
  })

  it('keeps persistent allow when content hash on request differs from entry', () => {
    const registry = createEmptyScriptPermissionRegistry()
    const request = { scriptKey: 'key-a', file: 'demo.ts', capability: 'network' as const, resource: 'example.com', contentHash: 'hash-b' }
    registry.entries[buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)] = {
      decision: 'allow',
      remember: 'persistent',
      contentHash: 'hash-a',
      updatedAt: 1,
    }
    expect(resolvePersistentPermissionDecision(registry, request)).toBe('allow')
  })

  it('keeps persistent allow when request has hash but entry does not', () => {
    const registry = createEmptyScriptPermissionRegistry()
    const request = { scriptKey: 'key-a', file: 'demo.ts', capability: 'network' as const, resource: 'example.com', contentHash: 'hash-a' }
    registry.entries[buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)] = {
      decision: 'allow',
      remember: 'persistent',
      updatedAt: 1,
    }
    expect(resolvePersistentPermissionDecision(registry, request)).toBe('allow')
  })

  it('keeps persistent allow when entry has hash but request does not', () => {
    const registry = createEmptyScriptPermissionRegistry()
    const request = { scriptKey: 'key-a', file: 'demo.ts', capability: 'network' as const, resource: 'example.com' }
    registry.entries[buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)] = {
      decision: 'allow',
      remember: 'persistent',
      contentHash: 'hash-a',
      updatedAt: 1,
    }
    expect(resolvePersistentPermissionDecision(registry, request)).toBe('allow')
  })

  it('does not enforce persistent registry rows set to ask each time', () => {
    const registry = createEmptyScriptPermissionRegistry()
    const request = { scriptKey: 'key-a', file: 'demo.ts', capability: 'network' as const, resource: 'example.com' }
    registry.entries[buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)] = {
      decision: 'allow',
      remember: 'persistent',
      adminPolicy: 'ask',
      updatedAt: 1,
    }
    expect(resolvePersistentPermissionDecision(registry, request)).toBeUndefined()
  })

  it('matches permission resource to request URL host', () => {
    expect(permissionResourceMatchesUrl('example.com', 'https://example.com/path')).toBe(true)
    expect(permissionResourceMatchesUrl('example.com', 'https://evil.com/')).toBe(false)
    expect(permissionResourceMatchesUrl('*', 'https://evil.com/')).toBe(true)
  })
})
