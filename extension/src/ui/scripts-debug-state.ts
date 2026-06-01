/** Default message when "Force error" is enabled in the scripts debug panel. */
export const DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE = 'Failed to load scripts (debug).'

export type ScriptsDebugOverrides = {
  forceLoading: boolean
  forceError: string | null
  forceEmpty: boolean
  /** Gray out all scriptKey groups (inactive server mock). */
  forceInactiveGroups: boolean
  errorMessage: string
}

const listeners = new Set<() => void>()

let overrides: ScriptsDebugOverrides = {
  forceLoading: false,
  forceError: null,
  forceEmpty: false,
  forceInactiveGroups: false,
  errorMessage: DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE,
}

/**
 * @returns Whether any debug override is active.
 */
export function isScriptsDebugActive(): boolean {
  return overrides.forceLoading || overrides.forceError !== null || overrides.forceEmpty || overrides.forceInactiveGroups
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
