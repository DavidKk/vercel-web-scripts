import { isPagePermissionAllowed } from '@ext/page/page-permission-allow-cache'
import { seedTrustModePageCacheSync } from '@ext/page/trust-permission-page-seed'
import { buildScriptPermissionRegistryKey } from '@shared/script-permission'
import { enterScriptPermissionScope, exitScriptPermissionScope, setPermissionTrustScriptKeys } from '@shared/script-permission-scope'

describe('trust-permission-page-seed', () => {
  const context = {
    scriptKey: 'key-a',
    file: 'shopline-debug.ts',
  }

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = context.scriptKey
    setPermissionTrustScriptKeys([context.scriptKey])
  })

  afterEach(() => {
    exitScriptPermissionScope()
    const g = globalThis as Record<string, unknown>
    delete g.__VWS_SCRIPT_KEY__
    delete g.__VWS_PERMISSION_ALLOW_KEYS__
    delete g.__VWS_PERMISSION_TRUST_SCRIPT_KEYS__
    delete g.__VWS_PERMISSION_STACK__
  })

  it('should sync-seed unsafe-window allow for Full trust before script body runs', () => {
    enterScriptPermissionScope(context.file)
    seedTrustModePageCacheSync(context)

    const request = { ...context, capability: 'unsafe-window' as const, resource: '*' }
    expect(isPagePermissionAllowed(request)).toBe(true)
    expect(buildScriptPermissionRegistryKey(context.scriptKey, context.file, 'unsafe-window', '*')).toBeTruthy()
  })

  it('should not seed when script key is not in trust list', () => {
    setPermissionTrustScriptKeys([])
    enterScriptPermissionScope(context.file)
    seedTrustModePageCacheSync(context)

    const request = { ...context, capability: 'unsafe-window' as const, resource: '*' }
    expect(isPagePermissionAllowed(request)).toBe(false)
  })
})
