import {
  createPresetCoreInjectionGate,
  ensurePresetCoreInjectionGate,
  markPresetCoreInjectionReady,
  PRESET_CORE_INJECTION_GATE_KEY,
  waitForPresetCoreInjectionReady,
} from '@shared/preset-core-injection-gate'

describe('preset-core-injection-gate', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[PRESET_CORE_INJECTION_GATE_KEY]
  })

  it('should resolve ready once when markReady is called', async () => {
    const gate = createPresetCoreInjectionGate()
    let settled = false
    void gate.ready.then(() => {
      settled = true
    })

    gate.markReady()
    gate.markReady()

    await gate.ready
    expect(settled).toBe(true)
  })

  it('should wait for ensurePresetCoreInjectionGate on globalThis', async () => {
    const gate = ensurePresetCoreInjectionGate()
    const pending = waitForPresetCoreInjectionReady()
    gate.markReady()
    await expect(pending).resolves.toBeUndefined()
  })

  it('should no-op wait when gate is absent', async () => {
    await expect(waitForPresetCoreInjectionReady()).resolves.toBeUndefined()
  })

  it('should mark ready via helper', async () => {
    ensurePresetCoreInjectionGate()
    const pending = waitForPresetCoreInjectionReady()
    markPresetCoreInjectionReady()
    await expect(pending).resolves.toBeUndefined()
  })
})
