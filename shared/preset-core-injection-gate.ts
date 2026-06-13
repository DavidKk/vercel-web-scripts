/** globalThis key for preset-core MAIN-world injection readiness (extension CSP path). */
export const PRESET_CORE_INJECTION_GATE_KEY = '__VWS_PRESET_CORE_INJECTION_GATE__'

export interface PresetCoreInjectionGate {
  ready: Promise<void>
  markReady: () => void
}

/**
 * Create a one-shot gate resolved when preset-core user-script injection finishes.
 * @returns Gate with idempotent {@link PresetCoreInjectionGate.markReady}
 */
export function createPresetCoreInjectionGate(): PresetCoreInjectionGate {
  let settled = false
  let resolveReady!: () => void
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  return {
    ready,
    markReady() {
      if (settled) {
        return
      }
      settled = true
      resolveReady()
    },
  }
}

/**
 * Ensure a preset-core injection gate exists on globalThis (extension launcher).
 * @returns Existing or newly created gate
 */
export function ensurePresetCoreInjectionGate(): PresetCoreInjectionGate {
  const host = globalThis as Record<string, unknown>
  const existing = host[PRESET_CORE_INJECTION_GATE_KEY] as PresetCoreInjectionGate | undefined
  if (existing?.ready && typeof existing.markReady === 'function') {
    return existing
  }
  const gate = createPresetCoreInjectionGate()
  host[PRESET_CORE_INJECTION_GATE_KEY] = gate
  return gate
}

/**
 * Mark preset-core injection complete so preset main can run remote script safely.
 */
export function markPresetCoreInjectionReady(): void {
  if (typeof globalThis === 'undefined') {
    return
  }
  ensurePresetCoreInjectionGate().markReady()
}

/**
 * Wait until preset-core CSP user-script injection completes (no-op when gate absent).
 * Preset main must await this before remote script eval on strict CSP sites.
 */
export async function waitForPresetCoreInjectionReady(): Promise<void> {
  if (typeof globalThis === 'undefined') {
    return
  }
  const gate = (globalThis as Record<string, unknown>)[PRESET_CORE_INJECTION_GATE_KEY] as PresetCoreInjectionGate | undefined
  if (!gate?.ready) {
    return
  }
  await gate.ready
}
