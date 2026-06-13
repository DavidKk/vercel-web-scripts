import { defaultDevelopModeForBaseUrl } from '@ext/shared/extension-services'
import {
  addScriptKeyRule,
  clearRuntimeModuleCachesForEnabledScriptKeys,
  countEnabledScriptsForEnabledScriptKeys,
  disableShellForTab,
  disableShellGlobally,
  enableShellMaster,
  ensureExtensionServicesState,
  getEnabledScriptKeys,
  getIncognitoLogCollectionEnabled,
  getShellGloballyEnabled,
  getShellLogOutputMode,
  getShellNetworkEnabled,
  gmStorageKey,
  isShellEnabledForTab,
  loadExtensionConfig,
  loadGmScopeForScriptKey,
  loadLocalRulesForEnabledScriptKeys,
  loadQuickAddRuleContext,
  removeScriptKeyRule,
  removeShellDisabledTabId,
  resetRuntimeStateForEnabledScriptKeys,
  resolveEditorServiceConfig,
  resolvePresetProjectVersion,
  setIncognitoLogCollectionEnabled,
  setShellLogOutputMode,
  setShellNetworkEnabled,
  SHELL_DISABLED_TAB_IDS_STORAGE_KEY,
  SHELL_MASTER_ENABLED_STORAGE_KEY,
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
  resetTabTriggerCountsForPageLoad,
} from '@ext/shared/tab-trigger-badge'
import { type ExtensionConfig } from '@ext/types'
import { SHELL_INCOGNITO_LOG_COLLECTION_KEY, SHELL_LOG_OUTPUT_MODE_KEY, shouldLogToMemoryForMode } from '@shared/shell-log-output'

import { DEV_BUILD_STAMP } from '../dev-build-stamp'
import type { DebugLogAppendInput } from '../shared/debug-log-types'
import { DEBUG_LOG_PORT_NAME } from '../shared/debug-log-types'
import { buildDebugLogMetaFromTab } from '../shared/debug-log-utils'
import { fetchExtensionUpdateInfo } from '../shared/extension-update-check'
import { extensionLogger } from '../shared/logger'
import { getCachedIncognitoLogCollection, getCachedShellLogOutputMode, refreshIncognitoLogCollectionCache, refreshShellLogOutputModeCache } from '../shared/shell-log-output-cache'
import { initBadgeNavigationListeners } from './badge-navigation'
import {
  appendDebugLog,
  attachDebugLogPort,
  clearDebugLogs,
  getDebugLogSnapshot,
  initDebugLogStore,
  normalizeDebugLogAppendDetails,
  setDebugLogCollectionGate,
  setIncognitoLogCollectionGate,
} from './debug-log-store'
import { restoreAdminPageAfterDevReload } from './dev-admin-restore'
import { initDevExtensionReload } from './dev-extension-reload'

void DEV_BUILD_STAMP

setDebugLogCollectionGate(() => shouldLogToMemoryForMode(getCachedShellLogOutputMode()))
setIncognitoLogCollectionGate(() => getCachedIncognitoLogCollection())

function enrichDebugLogFromSender(entry: DebugLogAppendInput, sender: chrome.runtime.MessageSender): DebugLogAppendInput {
  const tab = sender.tab
  if (!tab) {
    if (entry.meta?.incognito != null) {
      return entry
    }
    try {
      if (typeof chrome.extension?.inIncognitoContext === 'boolean') {
        return { ...entry, meta: { ...entry.meta, incognito: chrome.extension.inIncognitoContext } }
      }
    } catch {
      // ignore
    }
    return entry
  }
  const tabMeta = buildDebugLogMetaFromTab(tab.url, tab.id, tab.incognito)
  return {
    ...entry,
    meta: {
      ...tabMeta,
      ...entry.meta,
      incognito: entry.meta?.incognito ?? tab.incognito,
    },
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== DEBUG_LOG_PORT_NAME) {
    return
  }
  void initDebugLogStore().then(() => {
    attachDebugLogPort(port)
  })
})

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
  const baseUrl = details.baseUrl.trim().replace(/\/+$/, '')
  return {
    baseUrl,
    scriptKey: details.scriptKey.trim(),
    developMode: defaultDevelopModeForBaseUrl(baseUrl),
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
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
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

async function reloadAllReloadableTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null || !isReloadableTabUrl(tab.url)) {
        return
      }
      await chrome.tabs.reload(tab.id)
    })
  )
}

async function buildStatus(): Promise<ShellStatus> {
  const tab = await getActiveTab()
  const [config, servicesState, networkEnabled, logOutputMode, scriptTotals] = await Promise.all([
    loadExtensionConfig(),
    ensureExtensionServicesState(),
    getShellNetworkEnabled(),
    getShellLogOutputMode(),
    countEnabledScriptsForEnabledScriptKeys({ incognito: tab?.incognito === true }),
  ])
  const gmScope = config.scriptKey ? await loadGmScopeForScriptKey(config.scriptKey, config.baseUrl) : ''
  const presetVersion = await resolvePresetProjectVersion(config, gmScope, { allowManifestFetch: networkEnabled })
  const url = tab?.url ?? ''
  const enabledServices = servicesState.services.filter((service) => service.enabled)
  const enabledScriptKeys = getEnabledScriptKeys(servicesState.services)
  const configured = scriptTotals.serverCount > 0
  const triggeredCountOnActiveTab = tab?.id != null ? getTabTriggerCount(tab.id) : 0
  const shellGloballyEnabled = await getShellGloballyEnabled()
  const shellEnabledOnActiveTab = tab?.id != null ? await isShellEnabledForTab(tab.id) : shellGloballyEnabled
  const manifest = chrome.runtime.getManifest()
  const extensionVersion = manifest.version ?? '0.0.0'
  let extensionUpdateAvailable = false
  let latestExtensionVersion: string | null = null
  let extensionDownloadUrl: string | null = null
  if (networkEnabled && config.baseUrl.trim()) {
    const updateInfo = await fetchExtensionUpdateInfo(config.baseUrl, extensionVersion)
    extensionUpdateAvailable = updateInfo.updateAvailable
    latestExtensionVersion = updateInfo.latestVersion
    extensionDownloadUrl = updateInfo.downloadUrl
  }
  return {
    configured,
    baseUrl: config.baseUrl,
    scriptKey: config.scriptKey,
    enabledServiceCount: enabledServices.length,
    enabledScriptKeyCount: enabledScriptKeys.length,
    enabledScriptCount: scriptTotals.enabledScriptCount,
    networkEnabled,
    logOutputMode,
    triggeredCountOnActiveTab,
    activeTabUrl: url,
    extensionVersion,
    extensionUpdateAvailable,
    latestExtensionVersion,
    extensionDownloadUrl,
    presetVersion,
    shellEnabledOnActiveTab,
    shellGloballyEnabled,
  }
}

/** Chrome accepts hex or RGBA; RGBA is more reliable for badge text on macOS. */
const BADGE_BACKGROUND = '#3b82f6'
const BADGE_BACKGROUND_ERROR = '#dc2626'
const BADGE_TEXT_RGBA: [number, number, number, number] = [255, 255, 255, 255]
/** Non-empty badge text so Chrome shows a red pill when the master switch is off. */
const BADGE_SHELL_DISABLED_TEXT = '!'

function isHttpTabUrl(url: string | undefined): boolean {
  return Boolean(url?.startsWith('http://') || url?.startsWith('https://'))
}

type BadgeTarget = { tabId: number } | Record<string, never>

async function applyBadgeColors(target: BadgeTarget, hasError = false): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ ...target, color: hasError ? BADGE_BACKGROUND_ERROR : BADGE_BACKGROUND })
  // Must run after setBadgeText — Chrome otherwise keeps default black text.
  await chrome.action.setBadgeTextColor({ ...target, color: BADGE_TEXT_RGBA })
}

async function updateBadgeForTab(tabId: number, url?: string): Promise<void> {
  const target: BadgeTarget = { tabId }
  if (!isHttpTabUrl(url)) {
    clearTabTriggerState(tabId)
    await chrome.action.setBadgeText({ tabId, text: '' })
    await applyBadgeColors(target)
    return
  }
  if (!(await isShellEnabledForTab(tabId))) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_BACKGROUND_ERROR })
    await chrome.action.setBadgeText({ tabId, text: BADGE_SHELL_DISABLED_TEXT })
    await chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_RGBA })
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

async function initBackgroundDefaults(): Promise<void> {
  await Promise.all([refreshShellLogOutputModeCache(), refreshIncognitoLogCollectionCache()])
  await hydrateTabTriggerCounts()
  void applyBadgeColors({})
  void refreshAllBadges()
}

async function initExtensionInstall(): Promise<void> {
  clearDebugLogs()
  await initBackgroundDefaults()
}

chrome.runtime.onInstalled.addListener(() => {
  void initExtensionInstall()
})
chrome.runtime.onStartup.addListener(() => {
  void initDebugLogStore().then(() => initBackgroundDefaults())
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then((tab) => updateBadgeForTab(tabId, tab.url))
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') {
    void updateBadgeForTab(tabId, tab.url)
  }
})

initBadgeNavigationListeners(updateBadgeForTab)

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabTriggerState(tabId)
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
        case 'GET_SHELL_ENABLED_FOR_SENDER': {
          const tabId = _sender?.tab?.id
          if (tabId == null) {
            sendResponse({ ok: true, shellEnabled: await getShellGloballyEnabled() } satisfies ShellResponse)
            return
          }
          sendResponse({ ok: true, shellEnabled: await isShellEnabledForTab(tabId) } satisfies ShellResponse)
          return
        }
        case 'SET_NETWORK': {
          const previous = await getShellNetworkEnabled()
          await setShellNetworkEnabled(message.enabled)
          const next = await getShellNetworkEnabled()
          extensionLogger.debug(`[Shell network] toggle requested=${message.enabled} previous=${previous} next=${next}`)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'SET_SHELL_ENABLED': {
          const tab = await getActiveTab()
          if (message.enabled) {
            const wasGlobalOff = !(await getShellGloballyEnabled())
            await enableShellMaster(tab?.id, {
              clearAllTabDisables: wasGlobalOff || tab?.id == null,
            })
            if (wasGlobalOff) {
              await reloadAllReloadableTabs()
            } else {
              await reloadTab(tab)
            }
            await refreshAllBadges()
            sendResponse({ ok: true, message: 'Extension enabled.' } satisfies ShellResponse)
            return
          }
          if (message.scope === 'global') {
            await disableShellGlobally()
            await reloadAllReloadableTabs()
            await refreshAllBadges()
            sendResponse({ ok: true, message: 'Extension disabled on all tabs.' } satisfies ShellResponse)
            return
          }
          if (message.scope === 'tab') {
            if (tab?.id == null) {
              sendResponse({ ok: false, error: 'No active tab.' } satisfies ShellResponse)
              return
            }
            await disableShellForTab(tab.id)
            await reloadTab(tab)
            await refreshAllBadges()
            sendResponse({ ok: true, message: 'Extension disabled on this tab.' } satisfies ShellResponse)
            return
          }
          sendResponse({ ok: false, error: 'Choose this tab or all tabs to disable.' } satisfies ShellResponse)
          return
        }
        case 'SET_LOG_OUTPUT_MODE': {
          await setShellLogOutputMode(message.mode)
          await refreshShellLogOutputModeCache()
          extensionLogger.debug(`[Shell log output] mode=${message.mode}`)
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
          await focusOrOpenExtensionPage('admin.html#scripts')
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'OPEN_RULES_PAGE': {
          await focusOrOpenExtensionPage('admin.html#rules')
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'OPEN_OPTIONS': {
          await focusOrOpenExtensionPage('admin.html#servers')
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
        case 'GET_QUICK_ADD_RULE_CONTEXT': {
          const tab = await getActiveTab()
          const activeTabUrl = tab?.url ?? ''
          const items = await loadQuickAddRuleContext(activeTabUrl)
          sendResponse({
            ok: true,
            quickAddRuleContext: {
              activeTabUrl,
              items,
            },
          } satisfies ShellResponse)
          return
        }
        case 'GET_LOCAL_RULES': {
          const localRules = await loadLocalRulesForEnabledScriptKeys()
          sendResponse({
            ok: true,
            localRules,
          } satisfies ShellResponse)
          return
        }
        case 'ADD_LOCAL_RULE': {
          const created = await addScriptKeyRule(message.details.scriptKey, message.details.script, message.details.wildcard, message.details.mode)
          const tab = await getActiveTab()
          if (tab?.url?.startsWith('http')) {
            await scheduleTabMatchRefreshForEnabledScriptKeys(tab.url)
          }
          sendResponse({
            ok: true,
            message: created ? 'Local rule added.' : 'Local rule already exists.',
            ruleMutation: { created },
          } satisfies ShellResponse)
          return
        }
        case 'REMOVE_LOCAL_RULE': {
          const removed = await removeScriptKeyRule(message.details.scriptKey, message.details.script, message.details.wildcard, message.details.mode)
          const tab = await getActiveTab()
          if (tab?.url?.startsWith('http')) {
            await scheduleTabMatchRefreshForEnabledScriptKeys(tab.url)
          }
          sendResponse({
            ok: true,
            message: removed ? 'Local rule removed.' : 'Local rule not found.',
            ruleMutation: { removed },
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
        case 'APPEND_DEBUG_LOG': {
          await initDebugLogStore()
          const entries = normalizeDebugLogAppendDetails(message.details).map((entry) => enrichDebugLogFromSender(entry, _sender))
          appendDebugLog(entries)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'GET_DEBUG_LOGS': {
          await initDebugLogStore()
          sendResponse({ ok: true, debugLogs: getDebugLogSnapshot() } satisfies ShellResponse)
          return
        }
        case 'GET_INCOGNITO_LOG_COLLECTION': {
          sendResponse({ ok: true, incognitoLogCollection: await getIncognitoLogCollectionEnabled() } satisfies ShellResponse)
          return
        }
        case 'SET_INCOGNITO_LOG_COLLECTION': {
          await setIncognitoLogCollectionEnabled(message.enabled)
          await refreshIncognitoLogCollectionCache()
          sendResponse({ ok: true, incognitoLogCollection: message.enabled } satisfies ShellResponse)
          return
        }
        case 'CLEAR_DEBUG_LOGS': {
          clearDebugLogs()
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
void restoreAdminPageAfterDevReload()
