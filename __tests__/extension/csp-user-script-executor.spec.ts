import { executeInMainWorldScript, isUserScriptsApiAvailable } from '@ext/shell/csp-user-script-executor'

type UserScriptsMock = {
  getScripts: jest.Mock
  execute: jest.Mock
}

function installChromeUserScriptsMock(overrides?: Partial<UserScriptsMock>): UserScriptsMock {
  const mock: UserScriptsMock = {
    getScripts: jest.fn(),
    execute: jest.fn().mockResolvedValue([{ frameId: 0, documentId: 'doc-1' }]),
    ...overrides,
  }
  ;(globalThis as { chrome?: unknown }).chrome = {
    userScripts: mock,
  }
  return mock
}

describe('csp-user-script-executor', () => {
  afterEach(() => {
    delete (globalThis as { chrome?: unknown }).chrome
  })

  it('isUserScriptsApiAvailable returns false when getScripts throws', () => {
    installChromeUserScriptsMock({
      getScripts: jest.fn(() => {
        throw new Error('disabled')
      }),
    })
    expect(isUserScriptsApiAvailable()).toBe(false)
  })

  it('executeInMainWorldScript uses MAIN world', async () => {
    const mock = installChromeUserScriptsMock()
    const result = await executeInMainWorldScript(1, 'preset', { decls: 'var x=1;', presetCode: 'void 0;' })
    expect(result).toEqual({ ok: true })
    expect(mock.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 1 },
        world: 'MAIN',
      })
    )
  })

  it('executeInMainWorldScript reports CSP injection errors', async () => {
    installChromeUserScriptsMock({
      execute: jest.fn().mockResolvedValue([{ frameId: 0, documentId: 'doc-1', error: 'EvalError: unsafe-eval blocked' }]),
    })
    const result = await executeInMainWorldScript(2, 'global', { withBody: 'void 0;' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.cspBlocked).toBe(true)
    }
  })

  it('executeRawMainWorldCodeForTab returns script evaluation result', async () => {
    installChromeUserScriptsMock({
      execute: jest.fn().mockResolvedValue([{ frameId: 0, documentId: 'doc-1', result: { ok: true, tools: [] } }]),
    })
    const { executeRawMainWorldCodeForTab } = await import('@ext/shell/csp-user-script-executor')
    const result = await executeRawMainWorldCodeForTab(7, '(async()=>({ok:true}))();')
    expect(result).toEqual({ ok: true, value: { ok: true, tools: [] } })
  })
})
