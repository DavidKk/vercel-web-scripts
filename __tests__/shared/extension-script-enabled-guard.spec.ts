import { buildExtensionScriptEnabledGuard } from '@shared/extension-script-enabled-guard'

describe('extension-script-enabled-guard', () => {
  it('should skip execution when extension marks script disabled', () => {
    const globalObj = {
      __VWS_ENABLED_SCRIPTS__: {
        'table-copy-csv.ts': false,
      },
    } as Record<string, unknown>
    ;(globalThis as Record<string, unknown>).__GLOBAL__ = globalObj

    const body = `
      ${buildExtensionScriptEnabledGuard('table-copy-csv.ts')}
      globalThis.__ran = true
    `
    new Function(body)()

    expect((globalThis as Record<string, unknown>).__ran).toBeUndefined()
    delete (globalThis as Record<string, unknown>).__GLOBAL__
    delete (globalThis as Record<string, unknown>).__ran
  })

  it('should run when script is enabled or unset in extension map', () => {
    const globalObj = {
      __VWS_ENABLED_SCRIPTS__: {
        'table-copy-csv.ts': true,
        'other.ts': false,
      },
    } as Record<string, unknown>
    ;(globalThis as Record<string, unknown>).__GLOBAL__ = globalObj

    const body = `
      ${buildExtensionScriptEnabledGuard('table-copy-csv.ts')}
      globalThis.__ran = true
    `
    new Function(body)()

    expect((globalThis as Record<string, unknown>).__ran).toBe(true)
    delete (globalThis as Record<string, unknown>).__GLOBAL__
    delete (globalThis as Record<string, unknown>).__ran
  })

  it('should run when extension enabled map is absent', () => {
    const body = `
      ${buildExtensionScriptEnabledGuard('table-copy-csv.ts')}
      globalThis.__ran = true
    `
    new Function(body)()

    expect((globalThis as Record<string, unknown>).__ran).toBe(true)
    delete (globalThis as Record<string, unknown>).__ran
  })
})
