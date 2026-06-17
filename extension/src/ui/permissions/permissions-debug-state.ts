import type { ScriptPermissionCapability } from '@shared/script-permission'

export const DEFAULT_PERMISSIONS_DEBUG_ERROR_MESSAGE = 'Failed to load permissions (debug).'

export const DEBUG_PERMISSION_TEST_FILE = '__debug-permission-test__.ts'

export type PermissionsDebugOverrides = {
  forceLoading: boolean
  forceError: string | null
  forceEmpty: boolean
  mockSampleRows: boolean
  errorMessage: string
  /** Last-used values for permission prompt debug actions. */
  promptScriptKey: string
  promptResource: string
  promptCapability: ScriptPermissionCapability
  clipboardText: string
  /** When true, storefront-targeted debug actions activate the http(s) tab. */
  focusTargetTab: boolean
}

const listeners = new Set<() => void>()

let overrides: PermissionsDebugOverrides = {
  forceLoading: false,
  forceError: null,
  forceEmpty: false,
  mockSampleRows: false,
  errorMessage: DEFAULT_PERMISSIONS_DEBUG_ERROR_MESSAGE,
  promptScriptKey: '',
  promptResource: 'example.com',
  promptCapability: 'network',
  clipboardText: '[VWS debug] clipboard write test',
  focusTargetTab: false,
}

export function isPermissionsDebugActive(): boolean {
  return overrides.forceLoading || overrides.forceError !== null || overrides.forceEmpty || overrides.mockSampleRows
}

export function createMockPermissionRows(): Array<{
  key: string
  scriptKey: string
  file: string
  capability: string
  resource: string
  decision: string
  scope: 'Always' | 'This tab' | 'Once'
  updatedAt: number
  revocable: boolean
}> {
  const now = Date.now()
  return [
    {
      key: 'mock-key:checkout-helper.ts:network:api.example.com',
      scriptKey: 'mock-production-key',
      file: 'checkout-helper.ts',
      capability: 'Network access',
      resource: 'api.example.com',
      decision: 'Allow',
      scope: 'Always',
      updatedAt: now - 1000 * 60 * 5,
      revocable: true,
    },
    {
      key: 'mock-key:theme-tools.ts:clipboard-write:*',
      scriptKey: 'mock-staging-key',
      file: 'theme-tools.ts',
      capability: 'Write clipboard',
      resource: '*',
      decision: 'Deny',
      scope: 'Once',
      updatedAt: now - 1000 * 60 * 60 * 2,
      revocable: false,
    },
  ]
}

export function getPermissionsDebugOverrides(): Readonly<PermissionsDebugOverrides> {
  return overrides
}

export function setPermissionsDebugOverrides(patch: Partial<PermissionsDebugOverrides>): void {
  overrides = { ...overrides, ...patch }
  listeners.forEach((fn) => fn())
}

export function subscribePermissionsDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
