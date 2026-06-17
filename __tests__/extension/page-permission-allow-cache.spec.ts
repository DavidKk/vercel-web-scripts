import { hydratePagePermissionAllowKeys, isPagePermissionAllowed, rememberPagePermissionAllow } from '@ext/page/page-permission-allow-cache'
import { buildScriptPermissionRegistryKey } from '@shared/script-permission'

describe('page-permission-allow-cache', () => {
  afterEach(() => {
    const g = globalThis as Record<string, unknown>
    delete g.__VWS_PERMISSION_ALLOW_KEYS__
    delete g.__GLOBAL__
  })

  it('should allow synchronous checks after hydrate', () => {
    const request = {
      scriptKey: 'shop-key',
      file: 'shopline-debug.ts',
      capability: 'unsafe-window' as const,
      resource: '*',
    }
    const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
    hydratePagePermissionAllowKeys([key])

    expect(isPagePermissionAllowed(request)).toBe(true)
  })

  it('should remember allows after bridge grant', () => {
    const request = {
      scriptKey: 'shop-key',
      file: 'shopline-debug.ts',
      capability: 'unsafe-window' as const,
      resource: '*',
    }

    rememberPagePermissionAllow(request)

    expect(isPagePermissionAllowed(request)).toBe(true)
  })

  it('should replace cached allows when hydrate runs again', () => {
    const allowed = {
      scriptKey: 'shop-key',
      file: 'allowed.ts',
      capability: 'unsafe-window' as const,
      resource: '*',
    }
    const revoked = {
      scriptKey: 'shop-key',
      file: 'revoked.ts',
      capability: 'unsafe-window' as const,
      resource: '*',
    }
    const allowedKey = buildScriptPermissionRegistryKey(allowed.scriptKey, allowed.file, allowed.capability, allowed.resource)
    rememberPagePermissionAllow(revoked)
    expect(isPagePermissionAllowed(revoked)).toBe(true)

    hydratePagePermissionAllowKeys([allowedKey])

    expect(isPagePermissionAllowed(allowed)).toBe(true)
    expect(isPagePermissionAllowed(revoked)).toBe(false)
  })
})
