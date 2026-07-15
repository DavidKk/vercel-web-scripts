/**
 * Isolated content script entry: storage/XHR bridge + inject page-world launcher.
 */

import { isCloudflareChallengeRtTkUrl } from '../shared/extension-storage/shell-master-switch-pure'
import { installBridgeListeners } from './bridge-listeners'
import { bootstrapPageBridge, notifyTabPageLoad } from './page-bootstrap'
import { installPermissionAllowSyncListener } from './permission-allow-sync'
import { installPermissionModalListener } from './permission-modal'

const pageUrl = typeof location !== 'undefined' ? location.href : ''

/**
 * Cloudflare `__cf_chl_rt_tk` must be handled before any bridge / PRESET work.
 * Manual “This tab only” works because the tab is already disabled before load; we
 * mirror that by bailing out synchronously here (session write alone is too late / async).
 */
if (isCloudflareChallengeRtTkUrl(pageUrl)) {
  void chrome.runtime
    .sendMessage({
      type: 'SYNC_CLOUDFLARE_CHALLENGE_SHELL_DISABLE',
      details: { url: pageUrl },
    })
    .catch(() => undefined)
} else {
  installBridgeListeners()
  installPermissionModalListener()
  installPermissionAllowSyncListener()
  notifyTabPageLoad()
  void bootstrapPageBridge().catch(() => undefined)
}
