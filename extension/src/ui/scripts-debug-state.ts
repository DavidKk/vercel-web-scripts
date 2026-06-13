/** Default message when "Force error" is enabled in the scripts debug panel. */
export const DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE = 'Failed to load scripts (debug).'

export type ScriptsDebugOverrides = {
  forceLoading: boolean
  forceError: string | null
  forceEmpty: boolean
  mockSampleRows: boolean
  /** Gray out all scriptKey groups (inactive server mock). */
  forceInactiveGroups: boolean
  errorMessage: string
}

const listeners = new Set<() => void>()

let overrides: ScriptsDebugOverrides = {
  forceLoading: false,
  forceError: null,
  forceEmpty: false,
  mockSampleRows: false,
  forceInactiveGroups: false,
  errorMessage: DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE,
}

/**
 * @returns Whether any debug override is active.
 */
export function isScriptsDebugActive(): boolean {
  return overrides.forceLoading || overrides.forceError !== null || overrides.forceEmpty || overrides.mockSampleRows || overrides.forceInactiveGroups
}

/**
 * @returns Sample script groups for UI testing in the admin Scripts panel.
 */
export function createMockScriptKeyScriptsGroups() {
  const now = Date.now()
  return [
    {
      scriptKey: 'mock-production-key',
      active: true,
      serviceLabels: ['Production workspace', 'Fallback workspace'],
      primaryServiceLabel: 'Production workspace',
      editorBaseUrl: 'https://scripts.example.com',
      scripts: [
        { file: 'checkout-helper.ts', name: 'Checkout Helper', updatedAt: now - 1000 * 60 * 8 },
        { file: 'inventory-badge.ts', name: 'Inventory Badge', updatedAt: now - 1000 * 60 * 42 },
        { file: 'support-shortcuts.js', name: 'Support Shortcuts', updatedAt: now - 1000 * 60 * 60 * 3 },
      ],
    },
    {
      scriptKey: 'mock-staging-key',
      active: true,
      serviceLabels: ['Staging workspace'],
      primaryServiceLabel: 'Staging workspace',
      editorBaseUrl: 'https://staging-scripts.example.com',
      scripts: [
        { file: 'qa-annotator.ts', name: 'QA Annotator', updatedAt: now - 1000 * 60 * 14 },
        { file: 'theme-preview-tools.ts', name: 'Theme Preview Tools', updatedAt: now - 1000 * 60 * 60 * 9 },
      ],
    },
  ]
}

export function getScriptsDebugOverrides(): Readonly<ScriptsDebugOverrides> {
  return overrides
}

export function setScriptsDebugOverrides(patch: Partial<ScriptsDebugOverrides>): void {
  overrides = { ...overrides, ...patch }
  listeners.forEach((fn) => fn())
}

export function subscribeScriptsDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
