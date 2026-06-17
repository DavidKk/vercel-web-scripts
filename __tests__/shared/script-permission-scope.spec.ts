import { enterScriptPermissionScope, exitScriptPermissionScope, isScriptPermissionEnforced, SCRIPT_PERMISSION_ENFORCE_KEY } from '@shared/script-permission-scope'

describe('script-permission-scope', () => {
  afterEach(() => {
    const g = globalThis as Record<string, unknown>
    delete g.__VWS_PERMISSION_STACK__
    delete g[SCRIPT_PERMISSION_ENFORCE_KEY]
    delete g.__GLOBAL__
  })

  it('enforces only inside enterScriptPermissionScope', () => {
    expect(isScriptPermissionEnforced()).toBe(false)
    enterScriptPermissionScope('demo.ts')
    expect(isScriptPermissionEnforced()).toBe(true)
    exitScriptPermissionScope()
    expect(isScriptPermissionEnforced()).toBe(false)
  })

  it('keeps enforce flag while nested scopes are active', () => {
    enterScriptPermissionScope('outer.ts')
    enterScriptPermissionScope('inner.ts')
    exitScriptPermissionScope()
    expect(isScriptPermissionEnforced()).toBe(true)
    exitScriptPermissionScope()
    expect(isScriptPermissionEnforced()).toBe(false)
  })

  it('reads permission stack from launcher sandbox __GLOBAL__', () => {
    const sandbox: Record<string, unknown> = {}
    ;(globalThis as Record<string, unknown>).__GLOBAL__ = sandbox
    enterScriptPermissionScope('shopline-debug.ts')
    expect(sandbox.__VWS_PERMISSION_STACK__).toEqual([{ file: 'shopline-debug.ts' }])
    expect(isScriptPermissionEnforced()).toBe(true)
  })
})
