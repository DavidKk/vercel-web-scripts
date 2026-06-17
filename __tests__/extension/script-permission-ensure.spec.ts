import { sendPageBridgeRequest } from '@ext/page/page-bridge-client'
import { ensureScriptPermission, ensureScriptPermissionRequest, getActiveScriptPermissionContext } from '@ext/page/script-permission-scope'
import { enterScriptPermissionScope, exitScriptPermissionScope } from '@shared/script-permission-scope'

jest.mock('@ext/page/page-bridge-client', () => ({
  sendPageBridgeRequest: jest.fn(),
}))

const mockedSendPageBridgeRequest = sendPageBridgeRequest as jest.MockedFunction<typeof sendPageBridgeRequest>

describe('script-permission-ensure', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = 'shop-key'
    delete (globalThis as Record<string, unknown>).__VWS_PERMISSION_ALLOW_KEYS__
    mockedSendPageBridgeRequest.mockResolvedValue(true)
  })

  afterEach(() => {
    const g = globalThis as Record<string, unknown>
    delete g.__VWS_SCRIPT_KEY__
    delete g.__VWS_PERMISSION_ALLOW_KEYS__
    delete g.__GLOBAL__
    delete g.__VWS_PERMISSION_STACK__
    delete g.__VWS_SCRIPT_PERMISSION_ENFORCE__
  })

  it('should still prompt when explicit context is passed after scope exit', async () => {
    enterScriptPermissionScope('shopline-debug.ts')
    const context = getActiveScriptPermissionContext()
    exitScriptPermissionScope()

    await ensureScriptPermission('unsafe-window', '*', context)

    expect(mockedSendPageBridgeRequest).toHaveBeenCalledWith(
      'permission',
      [
        {
          scriptKey: 'shop-key',
          file: 'shopline-debug.ts',
          capability: 'unsafe-window',
          resource: '*',
        },
      ],
      5 * 60 * 1000
    )
  })

  it('should prompt from a captured request after scope exit', async () => {
    enterScriptPermissionScope('shopline-debug.ts')
    const context = getActiveScriptPermissionContext()
    exitScriptPermissionScope()

    await ensureScriptPermissionRequest(context ? { ...context, capability: 'unsafe-window', resource: '*' } : null, 'unsafe-window', '*')

    expect(mockedSendPageBridgeRequest).toHaveBeenCalledWith(
      'permission',
      [
        {
          scriptKey: 'shop-key',
          file: 'shopline-debug.ts',
          capability: 'unsafe-window',
          resource: '*',
        },
      ],
      5 * 60 * 1000
    )
  })

  it('should resolve script key from launcher sandbox __GLOBAL__', () => {
    const sandbox = { __VWS_SCRIPT_KEY__: 'sandbox-key' }
    ;(globalThis as Record<string, unknown>).__GLOBAL__ = sandbox
    enterScriptPermissionScope('shopline-debug.ts')

    expect(getActiveScriptPermissionContext()).toEqual({
      scriptKey: 'sandbox-key',
      file: 'shopline-debug.ts',
    })
  })

  it('should skip prompt when scope exited and no explicit context was passed', async () => {
    enterScriptPermissionScope('shopline-debug.ts')
    exitScriptPermissionScope()

    await ensureScriptPermission('unsafe-window', '*')

    expect(mockedSendPageBridgeRequest).not.toHaveBeenCalled()
  })
})
