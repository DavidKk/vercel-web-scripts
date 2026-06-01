import {
  clearRuntimeModuleCachesForEnabledScriptKeys,
  ensureExtensionServicesState,
  getEnabledScriptKeys,
  getShellNetworkEnabled,
  loadExtensionConfig,
  resetRuntimeStateForEnabledScriptKeys,
  resolveEditorServiceConfig,
  setShellNetworkEnabled,
  syncRulesForEnabledScriptKeys,
  syncRulesFromServer,
  upsertService,
} from '@ext/shared/extension-storage'
import { focusOrOpenExtensionPage, focusOrOpenTab } from '@ext/shared/focus-or-open-tab'
import type { ShellMessage, ShellResponse, ShellStatus } from '@ext/shared/messages'
import { invalidateTabMatchCache, scheduleTabMatchRefreshForEnabledScriptKeys, shouldInvalidateTabMatchCache } from '@ext/shared/tab-match-cache'
import {
  clearAllTabTriggerCounts,
  clearTabTriggerState,
  getTabTriggerCount,
  getTabTriggerHasError,
  hydrateTabTriggerCounts,
  incrementTabTriggerCount,
  markTabTriggerError,
  resetTabTriggerCountsForNavigation,
  resetTabTriggerCountsForPageLoad,
} from '@ext/shared/tab-trigger-badge'
import { type ExtensionConfig } from '@ext/types'

import { DEV_BUILD_STAMP } from '../dev-build-stamp'
import { initDevExtensionReload } from './dev-extension-reload'

void DEV_BUILD_STAMP

async function handleBridgeXhr(details: Extract<ShellMessage, { type: 'GM_XHR' }>['details']): Promise<ShellResponse> {
  const method = (details.method ?? 'GET').toUpperCase()
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timeout = typeof details.timeout === 'number' && details.timeout > 0 ? details.timeout : 0
  const timer = timeout && controller ? setTimeout(() => controller.abort(), timeout) : undefined
  const res = await fetch(details.url, {
    method,
    headers: details.headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : details.data,
    credentials: 'omit',
    signal: controller?.signal,
  }).finally(() => {
    if (timer) {
      clearTimeout(timer)
    }
  })
  const responseText = await res.text()
  const responseHeaders = Array.from(res.headers.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n')

  return {
    ok: true,
    xhr: {
      status: res.status,
      statusText: res.statusText,
      responseText,
      responseHeaders,
      finalUrl: res.url || details.url,
    },
  }
}

function normalizeWebConnectConfig(details: Extract<ShellMessage, { type: 'WEB_CONNECT_EXTENSION' }>['details']): ExtensionConfig {
  return {
    baseUrl: details.baseUrl.trim().replace(/\/+$/, ''),
    scriptKey: details.scriptKey.trim(),
    developMode: details.developMode !== false,
  }
}

async function handleWebConnect(details: Extract<ShellMessage, { type: 'WEB_CONNECT_EXTENSION' }>['details']): Promise<ShellResponse> {
  const nextConfig = normalizeWebConnectConfig(details)
  if (!nextConfig.baseUrl || !nextConfig.scriptKey) {
    return { ok: false, error: 'Missing Server URL or Script Key.' }
  }

  const { created, service } = await upsertService({
    baseUrl: nextConfig.baseUrl,
    scriptKey: nextConfig.scriptKey,
    developMode: nextConfig.developMode,
    enabled: true,
  })

  if (created) {
    try {
      await syncRulesFromServer({ baseUrl: service.baseUrl, scriptKey: service.scriptKey, developMode: nextConfig.developMode })
    } catch {
      // Connected; user can sync manually.
    }
    await reloadTab(await getActiveTab())
  }

  return {
    ok: true,
    status: await buildStatus(),
    message: created ? 'Extension connected.' : 'Service updated.',
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

/** http(s) pages and this extension's own pages (scripts/servers) can be reloaded. */
function isReloadableTabUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true
  }
  return url.startsWith(chrome.runtime.getURL(''))
}

async function reloadTab(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (tab?.id == null || !isReloadableTabUrl(tab.url)) {
    return
  }
  await chrome.tabs.reload(tab.id)
}

async function buildStatus(): Promise<ShellStatus> {
  const [config, servicesState, tab, networkEnabled] = await Promise.all([loadExtensionConfig(), ensureExtensionServicesState(), getActiveTab(), getShellNetworkEnabled()])
  const url = tab?.url ?? ''
  const enabledServices = servicesState.services.filter((service) => service.enabled !== false)
  const enabledScriptKeys = getEnabledScriptKeys(servicesState.services)
  const activeService = servicesState.services.find((service) => service.id === servicesState.activeServiceId) ?? enabledServices[0]
  const configured = enabledScriptKeys.length > 0
  const triggeredCountOnActiveTab = tab?.id != null ? getTabTriggerCount(tab.id) : 0
  const manifest = chrome.runtime.getManifest()
  return {
    configured,
    baseUrl: config.baseUrl,
    scriptKey: config.scriptKey,
    enabledServiceCount: enabledServices.length,
    enabledScriptKeyCount: enabledScriptKeys.length,
    activeServiceLabel: activeService?.label?.trim() ?? '',
    networkEnabled,
    triggeredCountOnActiveTab,
    activeTabUrl: url,
    extensionVersion: manifest.version ?? '0.0.0',
  }
}

/** Chrome accepts hex or RGBA; RGBA is more reliable for badge text on macOS. */
const BADGE_BACKGROUND = '#3b82f6'
const BADGE_BACKGROUND_ERROR = '#dc2626'
const BADGE_TEXT_RGBA: [number, number, number, number] = [255, 255, 255, 255]

type BadgeTarget = { tabId: number } | Record<string, never>

async function applyBadgeColors(target: BadgeTarget, hasError = false): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ ...target, color: hasError ? BADGE_BACKGROUND_ERROR : BADGE_BACKGROUND })
  // Must run after setBadgeText — Chrome otherwise keeps default black text.
  await chrome.action.setBadgeTextColor({ ...target, color: BADGE_TEXT_RGBA })
}

async function updateBadgeForTab(tabId: number, url?: string): Promise<void> {
  const target: BadgeTarget = { tabId }
  if (!url) {
    clearTabTriggerState(tabId)
    await chrome.action.setBadgeText({ tabId, text: '' })
    await applyBadgeColors(target)
    return
  }
  const n = getTabTriggerCount(tabId)
  const hasError = getTabTriggerHasError(tabId)
  const text = n > 0 ? String(Math.min(n, 99)) : ''
  await chrome.action.setBadgeBackgroundColor({ tabId, color: hasError ? BADGE_BACKGROUND_ERROR : BADGE_BACKGROUND })
  await chrome.action.setBadgeText({ tabId, text })
  await chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_RGBA })
}

async function refreshAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(tabs.map((t) => (t.id != null ? updateBadgeForTab(t.id, t.url) : Promise.resolve())))
}

async function initBadgeDefaults(): Promise<void> {
  await hydrateTabTriggerCounts()
  void applyBadgeColors({})
  void refreshAllBadges()
}

chrome.runtime.onInstalled.addListener(initBadgeDefaults)
chrome.runtime.onStartup.addListener(initBadgeDefaults)

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => updateBadgeForTab(tabId, tab.url))
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url) {
    resetTabTriggerCountsForNavigation(tabId, tab.url)
  }
  if (info.url || info.status === 'complete') {
    void updateBadgeForTab(tabId, tab.url)
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabTriggerState(tabId)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return
  }
  if (shouldInvalidateTabMatchCache(changes)) {
    void invalidateTabMatchCache()
  }
})

chrome.runtime.onMessage.addListener((message: ShellMessage, _sender, sendResponse) => {
  void (async (): Promise<void> => {
    try {
      switch (message.type) {
        case 'GM_XHR': {
          sendResponse(await handleBridgeXhr(message.details))
          return
        }
        case 'WEB_CONNECT_EXTENSION': {
          sendResponse(await handleWebConnect(message.details))
          return
        }
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
          const enabledKeys = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
          if (enabledKeys.length === 0) {
            sendResponse({ ok: false, error: 'Configure at least one enabled service first.' } satisfies ShellResponse)
            return
          }
          const cleared = await clearRuntimeModuleCachesForEnabledScriptKeys()
          await invalidateTabMatchCache()
          await clearAllTabTriggerCounts()
          const activeAfterUpdate = await getActiveTab()
          if (activeAfterUpdate?.id != null) {
            await updateBadgeForTab(activeAfterUpdate.id, activeAfterUpdate.url)
          }
          await reloadTab(activeAfterUpdate)
          sendResponse({
            ok: true,
            message: cleared > 1 ? `Runtime cache cleared for ${cleared} script keys.` : 'Runtime cache cleared.',
          } satisfies ShellResponse)
          return
        }
        case 'RESET_RUNTIME': {
          const enabledKeys = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
          if (enabledKeys.length === 0) {
            sendResponse({ ok: false, error: 'Configure at least one enabled service first.' } satisfies ShellResponse)
            return
          }
          await resetRuntimeStateForEnabledScriptKeys()
          await invalidateTabMatchCache()
          await clearAllTabTriggerCounts()
          const activeAfterReset = await getActiveTab()
          if (activeAfterReset?.id != null) {
            await updateBadgeForTab(activeAfterReset.id, activeAfterReset.url)
          }
          await reloadTab(activeAfterReset)
          sendResponse({
            ok: true,
            message: enabledKeys.length > 1 ? `Runtime state reset for ${enabledKeys.length} script keys.` : 'Runtime state reset.',
          } satisfies ShellResponse)
          return
        }
        case 'OPEN_EDITOR': {
          const editorConfig = await resolveEditorServiceConfig()
          if (!editorConfig?.baseUrl) {
            sendResponse({ ok: false, error: 'Configure at least one enabled service first.' } satisfies ShellResponse)
            return
          }
          await focusOrOpenTab(`${editorConfig.baseUrl.replace(/\/$/, '')}/editor`)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'OPEN_SCRIPTS_PAGE': {
          await focusOrOpenExtensionPage('scripts.html')
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'OPEN_OPTIONS': {
          await focusOrOpenExtensionPage('servers.html')
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'RELOAD_ACTIVE_TAB': {
          const tab = await getActiveTab()
          if (tab?.id == null) {
            sendResponse({ ok: false, error: 'No active tab.' } satisfies ShellResponse)
            return
          }
          if (!isReloadableTabUrl(tab.url)) {
            sendResponse({ ok: false, error: 'Cannot reload this tab (system pages are not supported).' } satisfies ShellResponse)
            return
          }
          await chrome.tabs.reload(tab.id)
          sendResponse({ ok: true, message: 'Tab reloaded.' } satisfies ShellResponse)
          return
        }
        case 'SYNC_RULES': {
          const enabledKeys = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
          if (enabledKeys.length === 0) {
            sendResponse({ ok: false, error: 'Configure at least one enabled service first.' } satisfies ShellResponse)
            return
          }
          const results = await syncRulesForEnabledScriptKeys()
          const total = results.reduce((sum, row) => sum + row.count, 0)
          const tab = await getActiveTab()
          if (tab?.url?.startsWith('http')) {
            await scheduleTabMatchRefreshForEnabledScriptKeys(tab.url)
          }
          sendResponse({
            ok: true,
            message: results.length > 1 ? `Synced ${total} rule(s) across ${results.length} script keys.` : `Synced ${total} rule(s).`,
          } satisfies ShellResponse)
          return
        }
        case 'TAB_PAGE_LOAD': {
          const tab = _sender?.tab
          if (tab?.id == null) {
            sendResponse({ ok: true } satisfies ShellResponse)
            return
          }
          const url = tab.url ?? message.details.url
          resetTabTriggerCountsForPageLoad(tab.id, url)
          await updateBadgeForTab(tab.id, url)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'SCRIPT_TRIGGERED': {
          const tab = _sender?.tab
          if (tab?.id == null) {
            sendResponse({ ok: true } satisfies ShellResponse)
            return
          }
          const { file, runAt, scriptKey } = message.details
          const dedupeKey = `${scriptKey ?? ''}|${file}|${runAt}`
          incrementTabTriggerCount(tab.id, tab.url, dedupeKey)
          await updateBadgeForTab(tab.id, tab.url)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'SCRIPT_FAILED': {
          const tab = _sender?.tab
          if (tab?.id == null) {
            sendResponse({ ok: true } satisfies ShellResponse)
            return
          }
          markTabTriggerError(tab.id, tab.url)
          await updateBadgeForTab(tab.id, tab.url)
          sendResponse({ ok: true } satisfies ShellResponse)
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
