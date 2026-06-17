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
        {
          file: 'checkout-helper.ts',
          name: 'Checkout Helper',
          description: 'Speed up checkout form autofill on storefront pages.',
          version: '1.2.0',
          author: 'MagickMonkey',
          updatedAt: now - 1000 * 60 * 8,
        },
        {
          file: 'inventory-badge.ts',
          name: 'Inventory Badge',
          description: 'Show low-stock badges on product cards.',
          version: '0.9.4',
          author: 'Store Ops',
          updatedAt: now - 1000 * 60 * 42,
        },
        {
          file: 'support-shortcuts.js',
          name: 'Support Shortcuts',
          description: 'Keyboard shortcuts for support workspace tools.',
          version: '2.0.1',
          author: 'Support Team',
          updatedAt: now - 1000 * 60 * 60 * 3,
        },
      ],
    },
    {
      scriptKey: 'mock-staging-key',
      active: true,
      serviceLabels: ['Staging workspace'],
      primaryServiceLabel: 'Staging workspace',
      editorBaseUrl: 'https://staging-scripts.example.com',
      scripts: [
        {
          file: 'qa-annotator.ts',
          name: 'QA Annotator',
          description: 'Annotate DOM nodes for QA review sessions.',
          version: '1.0.0',
          author: 'QA',
          updatedAt: now - 1000 * 60 * 14,
        },
        {
          file: 'theme-preview-tools.ts',
          name: 'Theme Preview Tools',
          description: 'Preview theme tokens without publishing.',
          version: '0.3.2',
          author: 'Theme Lab',
          updatedAt: now - 1000 * 60 * 60 * 9,
        },
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
