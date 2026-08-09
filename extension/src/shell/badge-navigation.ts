import { syncShellDisableForCloudflareChallenge } from '@ext/shared/extension-storage'
import { syncTabTriggerUrlForClientNavigation } from '@ext/shared/tab-trigger-badge'

type BadgeNavKind = 'document-load' | 'client-navigation'

type BadgeRefreshHandler = (tabId: number, url: string | undefined, kind: BadgeNavKind) => void | Promise<void>

/**
 * Wire webNavigation listeners for badge + Cloudflare shell disable.
 *
 * Badge / inject lifecycle reset is driven only by content-script `TAB_PAGE_LOAD`
 * (one inject cycle per real document). `onCommitted` and History API updates
 * must not clear trigger counts or flip the badge back to initializing — CSR
 * (e.g. Douyin swipe) must leave the post-inject badge state alone.
 *
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
      return syncTabTriggerUrlForClientNavigation(details.tabId, details.url).then(() => refreshBadge(details.tabId, details.url, 'client-navigation'))
    })
  })

  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) {
      return
    }
    void syncShellDisableForCloudflareChallenge(details.tabId, details.url).then(() => {
      return syncTabTriggerUrlForClientNavigation(details.tabId, details.url).then(() => refreshBadge(details.tabId, details.url, 'client-navigation'))
    })
  })
}
