/** Session-persisted per-tab script trigger counts (badge). Survives MV3 service worker restarts. */
export const TAB_TRIGGER_SESSION_KEY = 'vws_tab_trigger_state'

/** Lifecycle phase when trigger count is zero (see badge-display.ts). */
export type TabBadgePhase = 'initializing' | 'idle' | 'no-config' | 'reset-done' | 'update-done'

export interface TabTriggerState {
  url: string
  count: number
  /** Any GIST script failed on this page load (badge red background). */
  hasError?: boolean
  /** Dedupe keys for multi-scriptKey triggers (`scriptKey|file|runAt`). */
  dedupeKeys?: string[]
  /** Non-count badge phase for the current page load. */
  phase?: TabBadgePhase
}

const tabTriggerState = new Map<number, TabTriggerState>()

/** Single-flight hydration; cleared when simulating a service-worker restart. */
let hydratePromise: Promise<void> | undefined

/**
 * @param tabId Chrome tab id
 * @returns Trigger count for the tab, or 0 when unknown
 */
export function getTabTriggerCount(tabId: number): number {
  return tabTriggerState.get(tabId)?.count ?? 0
}

/**
 * Drop in-memory badge state and the hydration latch (session storage unchanged).
 * Simulates an MV3 service-worker restart for tests.
 */
export function simulateTabTriggerServiceWorkerRestart(): void {
  tabTriggerState.clear()
  hydratePromise = undefined
}

/**
 * Load session blob into the in-memory map (idempotent single-flight).
 * @returns Promise that resolves when hydration has finished
 */
export function ensureTabTriggerHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = loadTabTriggerCountsFromSession()
  }
  return hydratePromise
}

/**
 * Restore counts from `chrome.storage.session` after service worker wake.
 * @returns Promise that resolves when hydration has finished
 */
export async function hydrateTabTriggerCounts(): Promise<void> {
  await ensureTabTriggerHydrated()
}

async function loadTabTriggerCountsFromSession(): Promise<void> {
  try {
    const result = await chrome.storage.session.get(TAB_TRIGGER_SESSION_KEY)
    const raw = result[TAB_TRIGGER_SESSION_KEY] as Record<string, TabTriggerState> | undefined
    if (!raw) {
      return
    }
    tabTriggerState.clear()
    for (const [key, state] of Object.entries(raw)) {
      const tabId = Number(key)
      if (!Number.isFinite(tabId) || typeof state?.count !== 'number') {
        continue
      }
      const phase = state.phase
      tabTriggerState.set(tabId, {
        url: typeof state.url === 'string' ? state.url : '',
        count: Math.max(0, state.count),
        hasError: state.hasError === true,
        dedupeKeys: Array.isArray(state.dedupeKeys) ? state.dedupeKeys.filter((k): k is string => typeof k === 'string') : undefined,
        phase: phase === 'initializing' || phase === 'idle' || phase === 'no-config' || phase === 'reset-done' || phase === 'update-done' ? phase : undefined,
      })
    }
  } catch {
    // session storage may be unavailable in older Chromium builds
  }
}

async function persistTabTriggerCounts(): Promise<void> {
  const blob: Record<string, TabTriggerState> = {}
  for (const [tabId, state] of tabTriggerState) {
    blob[String(tabId)] = state
  }
  try {
    await chrome.storage.session.set({ [TAB_TRIGGER_SESSION_KEY]: blob })
  } catch {
    // ignore persistence errors
  }
}

/**
 * Drop trigger state for a closed or invalid tab.
 * @param tabId Chrome tab id
 */
export async function clearTabTriggerState(tabId: number): Promise<void> {
  await ensureTabTriggerHydrated()
  if (!tabTriggerState.delete(tabId)) {
    return
  }
  await persistTabTriggerCounts()
}

/**
 * Sync stored URL after CSR (`pushState` / `replaceState`) without clearing trigger count.
 * @param tabId Chrome tab id
 * @param url Current tab URL after client-side routing
 */
export async function syncTabTriggerUrlForClientNavigation(tabId: number, url: string | undefined): Promise<void> {
  if (!url) {
    return
  }
  await ensureTabTriggerHydrated()
  const state = tabTriggerState.get(tabId)
  if (!state || state.url === url) {
    return
  }
  tabTriggerState.set(tabId, { ...state, url })
  await persistTabTriggerCounts()
}

/**
 * Reset count when the tab navigates to a new URL (same tab id, new document).
 * @param tabId Chrome tab id
 * @param url Current tab URL after navigation
 */
export async function resetTabTriggerCountsForNavigation(tabId: number, url: string | undefined): Promise<void> {
  if (!url) {
    await clearTabTriggerState(tabId)
    return
  }
  await ensureTabTriggerHydrated()
  const prev = tabTriggerState.get(tabId)
  if (prev?.url === url) {
    return
  }
  await resetTabTriggerCountsForPageLoad(tabId, url)
}

/**
 * Reset count for a new top-level document (including same-URL reload).
 * @param tabId Chrome tab id
 * @param url Document URL for this load
 */
export async function resetTabTriggerCountsForPageLoad(tabId: number, url: string | undefined): Promise<void> {
  if (!url) {
    await clearTabTriggerState(tabId)
    return
  }
  await ensureTabTriggerHydrated()
  tabTriggerState.set(tabId, { url, count: 0, hasError: false, dedupeKeys: [], phase: 'initializing' })
  await persistTabTriggerCounts()
}

/**
 * @param tabId Chrome tab id
 * @returns Badge phase for the tab when present
 */
export function getTabBadgePhase(tabId: number): TabBadgePhase | undefined {
  return tabTriggerState.get(tabId)?.phase
}

/**
 * Set lifecycle phase for zero-count badge states.
 * @param tabId Chrome tab id
 * @param url Tab URL
 * @param phase Badge phase
 */
export async function setTabBadgePhase(tabId: number, url: string | undefined, phase: TabBadgePhase): Promise<void> {
  if (!url) {
    return
  }
  await ensureTabTriggerHydrated()
  const prev = tabTriggerState.get(tabId)
  if (prev?.url !== url) {
    tabTriggerState.set(tabId, { url, count: 0, hasError: false, dedupeKeys: [], phase })
  } else {
    tabTriggerState.set(tabId, { ...prev, phase })
  }
  await persistTabTriggerCounts()
}

/**
 * @param tabId Chrome tab id
 * @returns Whether any script failed on this page load
 */
export function getTabTriggerHasError(tabId: number): boolean {
  return tabTriggerState.get(tabId)?.hasError === true
}

/**
 * Mark that a script failed on this page load (badge red background until next load).
 * @param tabId Chrome tab id
 * @param url Tab URL at failure time
 */
export async function markTabTriggerError(tabId: number, url: string | undefined): Promise<void> {
  const href = url ?? ''
  await ensureTabTriggerHydrated()
  let state = tabTriggerState.get(tabId)
  if (!state || state.url !== href) {
    state = { url: href, count: 0, hasError: true, phase: undefined }
  } else {
    state.hasError = true
    state.phase = undefined
  }
  tabTriggerState.set(tabId, state)
  await persistTabTriggerCounts()
}

/**
 * Increment trigger count for a tab and persist.
 * @param tabId Chrome tab id
 * @param url Tab URL at trigger time
 * @param dedupeKey Optional dedupe key (`scriptKey|file|runAt`)
 * @returns New count after increment
 */
export async function incrementTabTriggerCount(tabId: number, url: string | undefined, dedupeKey?: string): Promise<number> {
  const href = url ?? ''
  await ensureTabTriggerHydrated()
  let state = tabTriggerState.get(tabId)
  if (!state || state.url !== href) {
    state = { url: href, count: 0, hasError: false, dedupeKeys: [], phase: undefined }
  }
  if (dedupeKey) {
    const keys = state.dedupeKeys ?? []
    if (keys.includes(dedupeKey)) {
      return state.count
    }
    state.dedupeKeys = [...keys, dedupeKey]
  }
  state.count += 1
  state.phase = undefined
  tabTriggerState.set(tabId, state)
  await persistTabTriggerCounts()
  return state.count
}

/**
 * Clear all tab trigger state (e.g. Update runtime).
 */
export async function clearAllTabTriggerCounts(): Promise<void> {
  await ensureTabTriggerHydrated()
  tabTriggerState.clear()
  try {
    await chrome.storage.session.remove(TAB_TRIGGER_SESSION_KEY)
  } catch {
    // ignore
  }
}
