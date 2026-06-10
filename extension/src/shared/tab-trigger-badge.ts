/** Session-persisted per-tab script trigger counts (badge). Survives MV3 service worker restarts. */
export const TAB_TRIGGER_SESSION_KEY = 'vws_tab_trigger_state'

export interface TabTriggerState {
  url: string
  count: number
  /** Any GIST script failed on this page load (badge red background). */
  hasError?: boolean
  /** Dedupe keys for multi-scriptKey triggers (`scriptKey|file|runAt`). */
  dedupeKeys?: string[]
}

const tabTriggerState = new Map<number, TabTriggerState>()

/**
 * @param tabId Chrome tab id
 */
export function getTabTriggerCount(tabId: number): number {
  return tabTriggerState.get(tabId)?.count ?? 0
}

/** Restore counts from `chrome.storage.session` after service worker wake. */
export async function hydrateTabTriggerCounts(): Promise<void> {
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
      tabTriggerState.set(tabId, {
        url: typeof state.url === 'string' ? state.url : '',
        count: Math.max(0, state.count),
        hasError: state.hasError === true,
        dedupeKeys: Array.isArray(state.dedupeKeys) ? state.dedupeKeys.filter((k): k is string => typeof k === 'string') : undefined,
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
export function clearTabTriggerState(tabId: number): void {
  if (!tabTriggerState.delete(tabId)) {
    return
  }
  void persistTabTriggerCounts()
}

/**
 * Sync stored URL after CSR (`pushState` / `replaceState`) without clearing trigger count.
 * @param tabId Chrome tab id
 * @param url Current tab URL after client-side routing
 */
export function syncTabTriggerUrlForClientNavigation(tabId: number, url: string | undefined): void {
  if (!url) {
    return
  }
  const state = tabTriggerState.get(tabId)
  if (!state || state.url === url) {
    return
  }
  tabTriggerState.set(tabId, { ...state, url })
  void persistTabTriggerCounts()
}

/**
 * Reset count when the tab navigates to a new URL (same tab id, new document).
 * @param tabId Chrome tab id
 * @param url Current tab URL after navigation
 */
export function resetTabTriggerCountsForNavigation(tabId: number, url: string | undefined): void {
  if (!url) {
    clearTabTriggerState(tabId)
    return
  }
  const prev = tabTriggerState.get(tabId)
  if (prev?.url === url) {
    return
  }
  resetTabTriggerCountsForPageLoad(tabId, url)
}

/**
 * Reset count for a new top-level document (including same-URL reload).
 * @param tabId Chrome tab id
 * @param url Document URL for this load
 */
export function resetTabTriggerCountsForPageLoad(tabId: number, url: string | undefined): void {
  if (!url) {
    clearTabTriggerState(tabId)
    return
  }
  tabTriggerState.set(tabId, { url, count: 0, hasError: false, dedupeKeys: [] })
  void persistTabTriggerCounts()
}

/**
 * @param tabId Chrome tab id
 */
export function getTabTriggerHasError(tabId: number): boolean {
  return tabTriggerState.get(tabId)?.hasError === true
}

/**
 * Mark that a script failed on this page load (badge red background until next load).
 * @param tabId Chrome tab id
 * @param url Tab URL at failure time
 */
export function markTabTriggerError(tabId: number, url: string | undefined): void {
  const href = url ?? ''
  let state = tabTriggerState.get(tabId)
  if (!state || state.url !== href) {
    state = { url: href, count: 0, hasError: true }
  } else {
    state.hasError = true
  }
  tabTriggerState.set(tabId, state)
  void persistTabTriggerCounts()
}

/**
 * Increment trigger count for a tab and persist.
 * @param tabId Chrome tab id
 * @param url Tab URL at trigger time
 * @param dedupeKey Optional dedupe key (`scriptKey|file|runAt`)
 * @returns New count after increment
 */
export function incrementTabTriggerCount(tabId: number, url: string | undefined, dedupeKey?: string): number {
  const href = url ?? ''
  let state = tabTriggerState.get(tabId)
  if (!state || state.url !== href) {
    state = { url: href, count: 0, hasError: false, dedupeKeys: [] }
  }
  if (dedupeKey) {
    const keys = state.dedupeKeys ?? []
    if (keys.includes(dedupeKey)) {
      return state.count
    }
    state.dedupeKeys = [...keys, dedupeKey]
  }
  state.count += 1
  tabTriggerState.set(tabId, state)
  void persistTabTriggerCounts()
  return state.count
}

/** Clear all tab trigger state (e.g. Update runtime). */
export async function clearAllTabTriggerCounts(): Promise<void> {
  tabTriggerState.clear()
  try {
    await chrome.storage.session.remove(TAB_TRIGGER_SESSION_KEY)
  } catch {
    // ignore
  }
}
