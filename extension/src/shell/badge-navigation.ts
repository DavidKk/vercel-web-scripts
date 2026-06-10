import { resetTabTriggerCountsForPageLoad, syncTabTriggerUrlForClientNavigation } from '@ext/shared/tab-trigger-badge'

type BadgeRefreshHandler = (tabId: number, url?: string) => void | Promise<void>

/**
 * Wire webNavigation listeners so badge counts reset on real document loads only.
 * CSR history updates sync URL without clearing counts (see tab-trigger-badge.ts).
 * @param refreshBadge Per-tab badge refresh callback
 */
export function initBadgeNavigationListeners(refreshBadge: BadgeRefreshHandler): void {
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }
    resetTabTriggerCountsForPageLoad(details.tabId, details.url)
    void refreshBadge(details.tabId, details.url)
  })

  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }
    syncTabTriggerUrlForClientNavigation(details.tabId, details.url)
    void refreshBadge(details.tabId, details.url)
  })
}
