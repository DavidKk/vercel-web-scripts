import { BADGE_BACKGROUND, BADGE_TEXT_RGBA, resolveBadgeDisplay } from '@ext/shared/badge-display'
import { consumeBadgeRuntimeHint } from '@ext/shared/badge-runtime-hint'
import { clearTabTriggerState, getTabBadgePhase, getTabTriggerCount, getTabTriggerHasError, setTabBadgePhase, type TabBadgePhase } from '@ext/shared/tab-trigger-badge'

type BadgeTarget = { tabId: number } | Record<string, never>

type BadgeRefreshHandler = (tabId: number, url?: string) => void | Promise<void>

const INITIALIZING_IDLE_MS = 15_000
const TRANSIENT_PHASE_MS = 3_000

const initializingTimers = new Map<number, ReturnType<typeof setTimeout>>()
const transientTimers = new Map<number, ReturnType<typeof setTimeout>>()

function isHttpTabUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith('http://') || url?.startsWith('https://'))
}

async function applyBadgeColors(target: BadgeTarget, backgroundColor: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ ...target, color: backgroundColor })
  await chrome.action.setBadgeTextColor({ ...target, color: BADGE_TEXT_RGBA })
}

function clearTimer(map: Map<number, ReturnType<typeof setTimeout>>, tabId: number): void {
  const timer = map.get(tabId)
  if (timer == null) {
    return
  }
  clearTimeout(timer)
  map.delete(tabId)
}

/**
 * @param tabId Chrome tab id
 * @param refreshBadge Per-tab badge refresh callback
 */
export function scheduleInitializingIdleFallback(tabId: number, refreshBadge: BadgeRefreshHandler): void {
  clearTimer(initializingTimers, tabId)
  initializingTimers.set(
    tabId,
    setTimeout(() => {
      initializingTimers.delete(tabId)
      if (getTabBadgePhase(tabId) !== 'initializing' || getTabTriggerCount(tabId) > 0) {
        return
      }
      void chrome.tabs.get(tabId).then((tab) => {
        if (getTabBadgePhase(tabId) !== 'initializing') {
          return
        }
        setTabBadgePhase(tabId, tab.url, 'idle')
        void refreshBadge(tabId, tab.url)
      })
    }, INITIALIZING_IDLE_MS)
  )
}

/**
 * @param tabId Chrome tab id
 * @param url Tab URL
 * @param phase Transient phase to show briefly
 * @param refreshBadge Per-tab badge refresh callback
 */
export function scheduleTransientBadgePhase(tabId: number, url: string | undefined, phase: TabBadgePhase, refreshBadge: BadgeRefreshHandler): void {
  if (!url) {
    return
  }
  setTabBadgePhase(tabId, url, phase)
  clearTimer(transientTimers, tabId)
  transientTimers.set(
    tabId,
    setTimeout(() => {
      transientTimers.delete(tabId)
      if (getTabBadgePhase(tabId) !== phase || getTabTriggerCount(tabId) > 0) {
        return
      }
      setTabBadgePhase(tabId, url, 'idle')
      void refreshBadge(tabId, url)
    }, TRANSIENT_PHASE_MS)
  )
}

/**
 * Apply runtime reset/update hint after bootstrap, if pending.
 * @param tabId Chrome tab id
 * @param url Tab URL
 * @param refreshBadge Per-tab badge refresh callback
 */
export async function applyBootstrapRuntimeHint(tabId: number, url: string | undefined, refreshBadge: BadgeRefreshHandler): Promise<void> {
  const hint = await consumeBadgeRuntimeHint()
  if (!hint || !url) {
    return
  }
  scheduleTransientBadgePhase(tabId, url, hint === 'reset' ? 'reset-done' : 'update-done', refreshBadge)
}

/**
 * @param tabId Chrome tab id
 */
export function clearBadgeTimersForTab(tabId: number): void {
  clearTimer(initializingTimers, tabId)
  clearTimer(transientTimers, tabId)
}

/**
 * @param isShellEnabledForTab Async shell gate for the tab
 */
export function createBadgeRefreshHandler(isShellEnabledForTab: (tabId: number) => Promise<boolean>): (tabId: number, url?: string) => Promise<void> {
  return async function updateBadgeForTab(tabId: number, url?: string): Promise<void> {
    const target: BadgeTarget = { tabId }
    if (!isHttpTabUrl(url)) {
      clearTabTriggerState(tabId)
      clearBadgeTimersForTab(tabId)
      await chrome.action.setBadgeText({ tabId, text: '' })
      await applyBadgeColors(target, BADGE_BACKGROUND)
      return
    }
    const shellEnabled = await isShellEnabledForTab(tabId)
    const resolved = resolveBadgeDisplay({
      isHttpTab: true,
      shellEnabled,
      triggerCount: getTabTriggerCount(tabId),
      hasError: getTabTriggerHasError(tabId),
      phase: getTabBadgePhase(tabId),
    })
    if (!resolved) {
      await chrome.action.setBadgeText({ tabId, text: '' })
      await applyBadgeColors(target, BADGE_BACKGROUND)
      return
    }
    await chrome.action.setBadgeBackgroundColor({ tabId, color: resolved.backgroundColor })
    await chrome.action.setBadgeText({ tabId, text: resolved.text })
    await chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_RGBA })
  }
}

/** Default toolbar badge colors before any per-tab refresh. */
export async function applyDefaultBadgeColors(): Promise<void> {
  await applyBadgeColors({}, BADGE_BACKGROUND)
}
