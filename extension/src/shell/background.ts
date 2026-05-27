import {
  clearRuntimeModuleCache,
  countMatchingRules,
  getShellNetworkEnabled,
  loadExtensionConfig,
  loadExtensionRules,
  resetRuntimeState,
  setShellNetworkEnabled,
  syncRulesFromServer,
} from '@ext/shared/extension-storage'
import { focusOrOpenExtensionPage, focusOrOpenTab } from '@ext/shared/focus-or-open-tab'
import type { ShellMessage, ShellResponse, ShellStatus } from '@ext/shared/messages'
import {
  getTabMatchCountForBadge,
  getTabMatchCountImmediate,
  invalidateTabMatchCache,
  scheduleTabMatchRefresh,
  shouldInvalidateTabMatchCache,
  TAB_MATCH_CACHE_KEY,
} from '@ext/shared/tab-match-cache'

import { initDevExtensionReload } from './dev-extension-reload'

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function buildStatus(): Promise<ShellStatus> {
  const [config, tab, networkEnabled] = await Promise.all([loadExtensionConfig(), getActiveTab(), getShellNetworkEnabled()])
  const url = tab?.url ?? ''
  const configured = Boolean(config.baseUrl && config.scriptKey)
  let matchCountOnActiveTab = 0
  if (url && configured) {
    matchCountOnActiveTab = await getTabMatchCountImmediate(config, url)
  } else if (url) {
    const rules = await loadExtensionRules()
    matchCountOnActiveTab = countMatchingRules(rules, url)
  }
  const manifest = chrome.runtime.getManifest()
  return {
    configured,
    baseUrl: config.baseUrl,
    scriptKey: config.scriptKey,
    networkEnabled,
    matchCountOnActiveTab,
    activeTabUrl: url,
    extensionVersion: manifest.version ?? '0.0.0',
  }
}

/** Chrome accepts hex or RGBA; RGBA is more reliable for badge text on macOS. */
const BADGE_BACKGROUND = '#3b82f6'
const BADGE_TEXT_RGBA: [number, number, number, number] = [255, 255, 255, 255]

type BadgeTarget = { tabId: number } | Record<string, never>

async function applyBadgeColors(target: BadgeTarget): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ ...target, color: BADGE_BACKGROUND })
  // Must run after setBadgeText — Chrome otherwise keeps default black text.
  await chrome.action.setBadgeTextColor({ ...target, color: BADGE_TEXT_RGBA })
}

async function updateBadgeForTab(tabId: number, url?: string): Promise<void> {
  const target: BadgeTarget = { tabId }
  if (!url) {
    await chrome.action.setBadgeText({ tabId, text: '' })
    await applyBadgeColors(target)
    return
  }
  const config = await loadExtensionConfig()
  const n = config.baseUrl && config.scriptKey ? await getTabMatchCountForBadge(config, url) : countMatchingRules(await loadExtensionRules(), url)
  const text = n > 0 ? String(Math.min(n, 99)) : ''
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_BACKGROUND })
  await chrome.action.setBadgeText({ tabId, text })
  await chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_RGBA })
}

let badgeRefreshTimer: ReturnType<typeof setTimeout> | undefined

async function refreshAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(tabs.map((t) => (t.id != null ? updateBadgeForTab(t.id, t.url) : Promise.resolve())))
}

function scheduleBadgeRefresh(): void {
  clearTimeout(badgeRefreshTimer)
  badgeRefreshTimer = setTimeout(() => {
    void refreshAllBadges()
  }, 200)
}

function initBadgeDefaults(): void {
  void applyBadgeColors({})
  void refreshAllBadges()
}

chrome.runtime.onInstalled.addListener(initBadgeDefaults)
chrome.runtime.onStartup.addListener(initBadgeDefaults)

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => updateBadgeForTab(tabId, tab.url))
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') {
    void updateBadgeForTab(tabId, tab.url)
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return
  }
  if (changes[TAB_MATCH_CACHE_KEY]) {
    scheduleBadgeRefresh()
    return
  }
  if (shouldInvalidateTabMatchCache(changes)) {
    void invalidateTabMatchCache().then(() => scheduleBadgeRefresh())
  }
})

chrome.runtime.onMessage.addListener((message: ShellMessage, _sender, sendResponse) => {
  void (async (): Promise<void> => {
    try {
      const config = await loadExtensionConfig()

      switch (message.type) {
        case 'GET_STATUS': {
          sendResponse({ ok: true, status: await buildStatus() } satisfies ShellResponse)
          return
        }
        case 'SET_NETWORK': {
          await setShellNetworkEnabled(message.enabled)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'UPDATE_RUNTIME': {
          if (!config.scriptKey) {
            sendResponse({ ok: false, error: 'Configure script key in Options first.' } satisfies ShellResponse)
            return
          }
          await clearRuntimeModuleCache(config)
          await invalidateTabMatchCache()
          const tab = await getActiveTab()
          if (tab?.id != null && tab.url?.startsWith('http')) {
            await chrome.tabs.reload(tab.id)
          }
          sendResponse({ ok: true, message: 'Runtime cache cleared.' } satisfies ShellResponse)
          return
        }
        case 'RESET_RUNTIME': {
          await resetRuntimeState(config)
          const tab = await getActiveTab()
          if (tab?.id != null && tab.url?.startsWith('http')) {
            await chrome.tabs.reload(tab.id)
          }
          sendResponse({ ok: true, message: 'Runtime state reset.' } satisfies ShellResponse)
          return
        }
        case 'OPEN_EDITOR': {
          if (!config.baseUrl) {
            sendResponse({ ok: false, error: 'Configure server URL in Options first.' } satisfies ShellResponse)
            return
          }
          await focusOrOpenTab(`${config.baseUrl.replace(/\/$/, '')}/editor`)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'OPEN_SCRIPTS_PAGE': {
          await focusOrOpenExtensionPage('scripts.html')
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'OPEN_OPTIONS': {
          await focusOrOpenExtensionPage('options.html')
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'RELOAD_ACTIVE_TAB': {
          const tab = await getActiveTab()
          if (tab?.id == null) {
            sendResponse({ ok: false, error: 'No active tab.' } satisfies ShellResponse)
            return
          }
          if (!tab.url?.startsWith('http')) {
            sendResponse({ ok: false, error: 'Cannot reload this tab.' } satisfies ShellResponse)
            return
          }
          await chrome.tabs.reload(tab.id)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'SYNC_RULES': {
          if (!config.scriptKey) {
            sendResponse({ ok: false, error: 'Configure script key in Options first.' } satisfies ShellResponse)
            return
          }
          const rules = await syncRulesFromServer(config)
          const tab = await getActiveTab()
          if (tab?.url?.startsWith('http')) {
            scheduleTabMatchRefresh(config, tab.url)
          }
          scheduleBadgeRefresh()
          sendResponse({ ok: true, message: `Synced ${rules.length} rule(s).` } satisfies ShellResponse)
          return
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message' } satisfies ShellResponse)
      }
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies ShellResponse)
    }
  })()
  return true
})

initDevExtensionReload()
