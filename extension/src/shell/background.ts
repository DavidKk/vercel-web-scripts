import { gmStorageKey, removeShellDisabledTabId, SHELL_DISABLED_TAB_IDS_STORAGE_KEY, SHELL_MASTER_ENABLED_STORAGE_KEY } from '@ext/shared/extension-storage'
import type { ShellMessage, ShellResponse } from '@ext/shared/messages'
import { invalidateTabMatchCache, shouldInvalidateTabMatchCache } from '@ext/shared/tab-match-cache'
import { clearTabTriggerState, ensureTabTriggerHydrated } from '@ext/shared/tab-trigger-badge'
import { SHELL_INCOGNITO_LOG_COLLECTION_KEY, SHELL_LOG_OUTPUT_MODE_KEY, shouldLogToMemoryForMode } from '@shared/shell-log-output'

import { DEV_BUILD_STAMP } from '../dev-build-stamp'
import { installPassiveOtaListener } from '../runtime/passive-ota-listener'
import { DEBUG_LOG_PORT_NAME } from '../shared/debug-log-types'
import { extensionLogger } from '../shared/logger'
import { getCachedIncognitoLogCollection, getCachedShellLogOutputMode, refreshIncognitoLogCollectionCache, refreshShellLogOutputModeCache } from '../shared/shell-log-output-cache'
import { handleShellMessage } from './background-message-handlers'
import { initBackgroundDefaults, initExtensionInstall, refreshAllBadges, updateBadgeForTab } from './background-status'
import { clearBadgeTimersForTab, scheduleInitializingIdleFallback } from './badge-controller'
import { initBadgeNavigationListeners } from './badge-navigation'
import { attachDebugLogPort, initDebugLogStore, setDebugLogCollectionGate, setIncognitoLogCollectionGate } from './debug-log-store'
import { restoreAdminPageAfterDevReload } from './dev-admin-restore'
import { initDevExtensionReload } from './dev-extension-reload'
import { clearSessionPermissionsForTab } from './permission-manager'
import { ensureOllamaOriginBypassRules } from './webmcp/agent-llm-ollama-origin-bypass'
import { registerWebMcpSidePanelCommandListener } from './webmcp/webmcp-side-panel'

void DEV_BUILD_STAMP

/** Eager hydrate on every service-worker start so early tab events see session counts. */
void ensureTabTriggerHydrated()
void ensureOllamaOriginBypassRules().catch((error) => {
  extensionLogger.warn('Ollama Origin bypass DNR install failed on SW start', error)
})

setDebugLogCollectionGate(() => shouldLogToMemoryForMode(getCachedShellLogOutputMode()))
setIncognitoLogCollectionGate(() => getCachedIncognitoLogCollection())

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== DEBUG_LOG_PORT_NAME) {
    return
  }
  void initDebugLogStore().then(() => {
    attachDebugLogPort(port)
  })
})

chrome.runtime.onInstalled.addListener(() => {
  void initExtensionInstall()
  void ensureOllamaOriginBypassRules().catch((error) => {
    extensionLogger.warn('Ollama Origin bypass DNR install failed onInstalled', error)
  })
})
chrome.runtime.onStartup.addListener(() => {
  void initDebugLogStore().then(() => initBackgroundDefaults())
  void ensureOllamaOriginBypassRules().catch((error) => {
    extensionLogger.warn('Ollama Origin bypass DNR install failed onStartup', error)
  })
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => updateBadgeForTab(tabId, tab.url))
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') {
    void updateBadgeForTab(tabId, tab.url)
  }
})

initBadgeNavigationListeners((tabId, url) => {
  scheduleInitializingIdleFallback(tabId, updateBadgeForTab)
  void updateBadgeForTab(tabId, url)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void clearTabTriggerState(tabId)
  clearBadgeTimersForTab(tabId)
  clearSessionPermissionsForTab(tabId)
  void removeShellDisabledTabId(tabId)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes[SHELL_MASTER_ENABLED_STORAGE_KEY]) {
      void refreshAllBadges()
    }
    if (changes[gmStorageKey(SHELL_LOG_OUTPUT_MODE_KEY)]) {
      void refreshShellLogOutputModeCache()
    }
    if (changes[gmStorageKey(SHELL_INCOGNITO_LOG_COLLECTION_KEY)]) {
      void refreshIncognitoLogCollectionCache()
    }
    if (shouldInvalidateTabMatchCache(changes)) {
      void invalidateTabMatchCache()
    }
    return
  }
  if (area === 'session' && changes[SHELL_DISABLED_TAB_IDS_STORAGE_KEY]) {
    void refreshAllBadges()
  }
})

chrome.runtime.onMessage.addListener((message: ShellMessage, sender, sendResponse) => {
  void (async (): Promise<void> => {
    try {
      const response = await handleShellMessage(message, sender)
      if (response !== undefined) {
        sendResponse(response satisfies ShellResponse)
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies ShellResponse)
    }
  })()
  return true
})

initDevExtensionReload()
registerWebMcpSidePanelCommandListener()
void restoreAdminPageAfterDevReload()
installPassiveOtaListener()
