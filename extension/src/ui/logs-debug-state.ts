import type { DebugLogEntry } from '@ext/shared/debug-log-types'

/** Default message when "Force error" is enabled in the logs debug panel. */
export const DEFAULT_LOGS_DEBUG_ERROR_MESSAGE = 'Failed to load logs (debug).'

export type LogsDebugOverrides = {
  forceLoading: boolean
  forceError: string | null
  forceEmpty: boolean
  mockSampleEntries: boolean
  errorMessage: string
}

const listeners = new Set<() => void>()

let overrides: LogsDebugOverrides = {
  forceLoading: false,
  forceError: null,
  forceEmpty: false,
  mockSampleEntries: false,
  errorMessage: DEFAULT_LOGS_DEBUG_ERROR_MESSAGE,
}

/**
 * @returns Whether any logs debug override is active.
 */
export function isLogsDebugActive(): boolean {
  return overrides.forceLoading || overrides.forceError !== null || overrides.forceEmpty || overrides.mockSampleEntries
}

export function getLogsDebugOverrides(): Readonly<LogsDebugOverrides> {
  return overrides
}

export function setLogsDebugOverrides(patch: Partial<LogsDebugOverrides>): void {
  overrides = { ...overrides, ...patch }
  listeners.forEach((fn) => fn())
}

export function subscribeLogsDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * @returns Sample debug log rows for UI testing in the admin Logs panel.
 */
export function createMockDebugLogEntries(): DebugLogEntry[] {
  const now = Date.now()
  return [
    {
      id: -1,
      t: now - 8000,
      source: 'background',
      scope: 'Shell',
      level: 'info',
      message: 'Mock: extension background ready',
    },
    {
      id: -2,
      t: now - 6000,
      source: 'inject',
      scope: 'Boot',
      level: 'ok',
      message: 'Mock: preset launcher injected',
      meta: { host: 'www.example.com', tabId: 10001, url: 'https://www.example.com/', incognito: false },
    },
    {
      id: -3,
      t: now - 4000,
      source: 'page',
      scope: 'Preset',
      level: 'warn',
      message: 'Mock: message with\ttab and "quotes"',
      meta: { host: 'shop.example.com', tabId: 10002, url: 'https://shop.example.com/cart', incognito: false },
    },
    {
      id: -4,
      t: now - 2000,
      source: 'content',
      scope: 'Bridge',
      level: 'error',
      message: 'Mock: incognito tab error sample',
      meta: { host: 'private.example.com', tabId: 10003, url: 'https://private.example.com/', incognito: true },
    },
  ]
}
