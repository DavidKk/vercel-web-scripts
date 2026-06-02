/**
 * Dev watch only: reopen admin.html after SSE-triggered extension reload when it was open.
 */

declare const __EXTENSION_DEV_RELOAD_SSE__: string

import { ADMIN_PAGE, adminPagePathFromTabUrl, LEGACY_ADMIN_PAGES } from '@ext/shared/admin-page-url'
import { focusOrOpenExtensionPage } from '@ext/shared/focus-or-open-tab'

const DEV_RELOAD_RESTORE_ADMIN_KEY = 'vws_dev_reload_restore_admin'

function isDevWatchBuild(): boolean {
  return typeof __EXTENSION_DEV_RELOAD_SSE__ !== 'undefined' && __EXTENSION_DEV_RELOAD_SSE__ !== ''
}

function pickAdminTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
  return tabs.find((tab) => tab.active) ?? tabs[0]
}

/**
 * Before dev SSE reload: persist admin route when an admin tab is open.
 */
export async function captureAdminPageForDevReload(): Promise<void> {
  if (!isDevWatchBuild()) {
    return
  }

  const adminUrl = `${chrome.runtime.getURL(ADMIN_PAGE)}*`
  const legacyUrls = [...LEGACY_ADMIN_PAGES].map((legacyPage) => `${chrome.runtime.getURL(legacyPage)}*`)
  const tabs = await chrome.tabs.query({ url: [adminUrl, ...legacyUrls] })
  if (tabs.length === 0) {
    await chrome.storage.local.remove(DEV_RELOAD_RESTORE_ADMIN_KEY)
    return
  }

  await chrome.storage.local.set({
    [DEV_RELOAD_RESTORE_ADMIN_KEY]: adminPagePathFromTabUrl(pickAdminTab(tabs)?.url),
  })
}

/**
 * After dev SSE reload: focus or reopen admin at the captured route.
 */
export async function restoreAdminPageAfterDevReload(): Promise<void> {
  if (!isDevWatchBuild()) {
    return
  }

  const stored = await chrome.storage.local.get(DEV_RELOAD_RESTORE_ADMIN_KEY)
  const pagePath = stored[DEV_RELOAD_RESTORE_ADMIN_KEY]
  if (typeof pagePath !== 'string' || !pagePath) {
    return
  }

  try {
    await focusOrOpenExtensionPage(pagePath)
  } catch {
    return
  }

  await chrome.storage.local.remove(DEV_RELOAD_RESTORE_ADMIN_KEY)
}
