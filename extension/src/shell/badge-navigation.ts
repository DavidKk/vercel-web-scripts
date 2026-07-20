import { syncShellDisableForCloudflareChallenge } from '@ext/shared/extension-storage'
import { resetTabTriggerCountsForPageLoad, syncTabTriggerUrlForClientNavigation } from '@ext/shared/tab-trigger-badge'

type BadgeRefreshHandler = (tabId: number, url?: string) => void | Promise<void>

/**
 * Wire webNavigation listeners so badge counts reset on real document loads only.
 * CSR history updates sync URL without clearing counts (see tab-trigger-badge.ts).
 * Cloudflare `__cf_chl_rt_tk`: apply “This tab only” disable on **beforeNavigate**
 * so session storage is written before the content script runs (same timing as a
 * manual disable + reload).
 * @param refreshBadge Per-tab badge refresh callback
 */
export function initBadgeNavigationListeners(refreshBadge: BadgeRefreshHandler): void {
  chrome.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }
    void syncShellDisableForCloudflareChallenge(details.tabId, details.url)
  })

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }
    void syncShellDisableForCloudflareChallenge(details.tabId, details.url).then(() => {
      return resetTabTriggerCountsForPageLoad(details.tabId, details.url).then(() => refreshBadge(details.tabId, details.url))
    })
  })

  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }
    void syncShellDisableForCloudflareChallenge(details.tabId, details.url).then(() => {
      return syncTabTriggerUrlForClientNavigation(details.tabId, details.url).then(() => refreshBadge(details.tabId, details.url))
    })
  })
}
