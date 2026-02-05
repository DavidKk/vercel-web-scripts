/**
 * GM storage polyfill for non-Tampermonkey environments (e.g. E2E tests).
 * When GM_getValue/GM_setValue are not defined, provides an in-memory mock
 * so preset can run without Tampermonkey. Must be loaded first in entry.
 */

const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as Record<string, unknown>)

if (typeof (g as any).GM_getValue === 'undefined') {
  const store: Record<string, unknown> = {}
  ;(g as any).GM_setValue = function (key: string, value: unknown): void {
    store[key] = value
  }
  ;(g as any).GM_getValue = function <T>(key: string, defaultValue?: T): T {
    return (key in store ? store[key] : defaultValue) as T
  }
  ;(g as any).GM_addValueChangeListener = function (): string {
    return ''
  }
  ;(g as any).GM_removeValueChangeListener = function (): void {
    // no-op
  }
}
