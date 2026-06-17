import { defaultDevelopModeForBaseUrl } from '@ext/shared/extension-services'
import {
  addScriptKeyRule,
  clearAllRuntimeCachesForEnabledScriptKeys,
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
  listScriptPermissionRegistryRows,
  loadExtensionConfig,
  loadGmScopeForScriptKey,
  loadLocalRulesForEnabledScriptKeys,
  loadQuickAddRuleContext,
  readScriptPermissionRegistry,
  refreshScriptListsForEnabledScriptKeys,
  removePersistentPermissionEntryByKey,
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
  writeScriptPermissionRegistry,
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
import { PERMISSION_DENIED_CODE, permissionResourceMatchesUrl } from '@shared/script-permission'
import { SHELL_INCOGNITO_LOG_COLLECTION_KEY, SHELL_LOG_OUTPUT_MODE_KEY, shouldLogToMemoryForMode } from '@shared/shell-log-output'

import { DEV_BUILD_STAMP } from '../dev-build-stamp'
import type { DebugLogAppendInput } from '../shared/debug-log-types'
import { DEBUG_LOG_PORT_NAME } from '../shared/debug-log-types'
import { buildDebugLogMetaFromTab } from '../shared/debug-log-utils'
import { fetchExtensionUpdateInfo } from '../shared/extension-update-check'
import { extensionLogger, permissionLogger } from '../shared/logger'
import { getCachedIncognitoLogCollection, getCachedShellLogOutputMode, refreshIncognitoLogCollectionCache, refreshShellLogOutputModeCache } from '../shared/shell-log-output-cache'
import { initBadgeNavigationListeners } from './badge-navigation'
import { disableCspStripForPageUrl } from './csp-dnr-rules'
import { reloadTabOnceForCsp } from './csp-tab-reload'
import { CSP_RELOAD_SCHEDULED_MESSAGE, executeInMainWorldScriptForTab } from './csp-user-script-executor'
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
import {
  applyPermissionModalResult,
  clearAllScriptPermissions,
  clearSessionPermissionsForTab,
  ensureScriptPermissionForTab,
  hydrateScriptPermissionSession,
  listAllowedPermissionKeysForTab,
  listPermissionHistoryEntries,
  listSessionPermissionEntries,
  PERMISSION_MODAL_RESULT_MESSAGE_TYPE,
  PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE,
  removeSessionPermissionByKey,
  removeSessionPermissionByKeyAllTabs,
  seedSessionConnectAllows,
  seedTrustedTier1Permissions,
  setPermissionModalRelay,
  updateAdminScriptPermissionEntriesBatch,
  updateAdminScriptPermissionEntry,
} from './permission-manager'

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

async function handleBridgeXhr(details: Extract<ShellMessage, { type: 'GM_XHR' }>['details'], tabId?: number): Promise<ShellResponse> {
  const method = (details.method ?? 'GET').toUpperCase()
  const url = details.url?.trim()
  if (!url) {
    throw new Error('GM_XHR missing URL')
  }
  if (tabId != null && details.permission) {
    if (!permissionResourceMatchesUrl(details.permission.resource, url)) {
      throw new Error(PERMISSION_DENIED_CODE)
    }
    const allowed = await ensureScriptPermissionForTab(tabId, details.permission)
    if (!allowed) {
      throw new Error(PERMISSION_DENIED_CODE)
    }
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timeout = typeof details.timeout === 'number' && details.timeout > 0 ? details.timeout : 0
  const timer = timeout && controller ? setTimeout(() => controller.abort(), timeout) : undefined
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: details.headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : details.data,
      credentials: 'omit',
      signal: controller?.signal,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`GM_XHR fetch failed: ${message} url=${url.slice(0, 180)}`)
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
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
      finalUrl: res.url || url,
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

/** Prefer focused http(s) tab for permission debug prompts (admin UI may be the active tab). */
async function resolveDebugPermissionTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const active = await getActiveTab()
  if (active?.url?.startsWith('http://') || active?.url?.startsWith('https://')) {
    return active
  }
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true })
  return tabs.find((t) => t.url?.startsWith('http://') || t.url?.startsWith('https://'))
}

async function resolveDebugPermissionScriptKey(hint?: string): Promise<string> {
  const trimmed = hint?.trim()
  if (trimmed) {
    return trimmed
  }
  const enabled = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
  if (enabled.length === 0) {
    throw new Error('Configure at least one enabled service (script key).')
  }
  return enabled[0]!
}

/** When debugging from admin, show permission modal on sender tab instead of background storefront tab. */
function maybeRelayPermissionModalToSender(sender: chrome.runtime.MessageSender, targetTabId: number, focusTab?: boolean): void {
  if (focusTab) {
    return
  }
  const senderTabId = sender.tab?.id
  if (senderTabId == null || senderTabId === targetTabId) {
    return
  }
  setPermissionModalRelay(targetTabId, senderTabId)
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
/** Non-empty badge text so Chrome shows a red pill when shell is off or a script failed with no trigger count. */
const BADGE_ALERT_TEXT = '!'

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
    await chrome.action.setBadgeText({ tabId, text: BADGE_ALERT_TEXT })
    await chrome.action.setBadgeTextColor({ tabId, color: BADGE_TEXT_RGBA })
    return
  }
  const n = getTabTriggerCount(tabId)
  const hasError = getTabTriggerHasError(tabId)
  const text = n > 0 ? String(Math.min(n, 99)) : hasError ? BADGE_ALERT_TEXT : ''
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
  await Promise.all([hydrateTabTriggerCounts(), hydrateScriptPermissionSession()])
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

chrome.runtime.onMessage.addListener((message: ShellMessage, _sender, sendResponse) => {
  void (async (): Promise<void> => {
    try {
      switch (message.type) {
        case 'GM_XHR': {
          sendResponse(await handleBridgeXhr(message.details, _sender.tab?.id))
          return
        }
        case 'SCRIPT_PERMISSION_ENSURE': {
          const tabId = _sender.tab?.id
          if (tabId == null) {
            permissionLogger.warn('ensure:no-tab')
            sendResponse({ ok: false, error: 'No tab for permission request.' } satisfies ShellResponse)
            return
          }
          permissionLogger.debug('message:SCRIPT_PERMISSION_ENSURE', {
            tabId,
            file: message.request.file,
            capability: message.request.capability,
            resource: message.request.resource,
          })
          const allowed = await ensureScriptPermissionForTab(tabId, message.request)
          sendResponse({ ok: true, allowed } satisfies ShellResponse)
          return
        }
        case PERMISSION_MODAL_RESULT_MESSAGE_TYPE: {
          await applyPermissionModalResult(message.payload)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'GET_PAGE_PERMISSION_ALLOW_KEYS': {
          const tabId = _sender.tab?.id
          if (tabId == null) {
            sendResponse({ ok: false, error: 'No tab for permission allow keys.' } satisfies ShellResponse)
            return
          }
          const permissionAllowKeys = await listAllowedPermissionKeysForTab(tabId)
          sendResponse({ ok: true, permissionAllowKeys } satisfies ShellResponse)
          return
        }
        case 'CLEAR_ALL_SCRIPT_PERMISSIONS': {
          await clearAllScriptPermissions()
          sendResponse({ ok: true, message: 'All script permissions cleared.' } satisfies ShellResponse)
          return
        }
        case 'GET_SCRIPT_PERMISSION_REGISTRY': {
          const registry = await readScriptPermissionRegistry()
          sendResponse({
            ok: true,
            scriptPermissionEntries: listScriptPermissionRegistryRows(registry),
            sessionPermissionEntries: listSessionPermissionEntries(),
            permissionHistoryEntries: await listPermissionHistoryEntries(),
          } satisfies ShellResponse)
          return
        }
        case 'REMOVE_SCRIPT_PERMISSION_ENTRY': {
          const registry = await readScriptPermissionRegistry()
          const next = removePersistentPermissionEntryByKey(registry, message.key)
          const removedRegistry = Object.keys(registry.entries).length !== Object.keys(next.entries).length
          if (removedRegistry) {
            await writeScriptPermissionRegistry(next)
          }
          const removedSession = removeSessionPermissionByKeyAllTabs(message.key)
          if (removedRegistry || removedSession) {
            void chrome.runtime.sendMessage({ type: PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE }).catch(() => undefined)
          }
          sendResponse({ ok: true, removed: removedRegistry || removedSession } satisfies ShellResponse)
          return
        }
        case 'REMOVE_SESSION_PERMISSION_ENTRY': {
          const removed = removeSessionPermissionByKey(message.tabId, message.key)
          sendResponse({ ok: true, removed } satisfies ShellResponse)
          return
        }
        case 'UPDATE_SCRIPT_PERMISSION_ENTRY': {
          try {
            await updateAdminScriptPermissionEntry({
              registryKey: message.registryKey,
              request: message.request,
              scope: message.scope,
              tabId: message.tabId,
              decision: message.decision,
              policy: message.policy,
            })
            sendResponse({ ok: true } satisfies ShellResponse)
          } catch (error) {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            } satisfies ShellResponse)
          }
          return
        }
        case 'UPDATE_SCRIPT_PERMISSION_ENTRIES': {
          try {
            await updateAdminScriptPermissionEntriesBatch(message.updates)
            sendResponse({ ok: true } satisfies ShellResponse)
          } catch (error) {
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            } satisfies ShellResponse)
          }
          return
        }
        case 'SCRIPT_PERMISSION_SEED_CONNECTS': {
          const tabId = _sender.tab?.id
          if (tabId == null) {
            sendResponse({ ok: false, error: 'No tab for connect seed.' } satisfies ShellResponse)
            return
          }
          await seedSessionConnectAllows(tabId, message.context, message.connects)
          sendResponse({ ok: true } satisfies ShellResponse)
          return
        }
        case 'SCRIPT_PERMISSION_SEED_TRUST_TIER1': {
          const tabId = _sender.tab?.id
          if (tabId == null) {
            sendResponse({ ok: false, error: 'No tab for trust tier-1 seed.' } satisfies ShellResponse)
            return
          }
          const grantedKeys = await seedTrustedTier1Permissions(tabId, message.context)
          sendResponse({ ok: true, grantedKeys } satisfies ShellResponse)
          return
        }
        case 'DEBUG_PERMISSION_PROMPT': {
          const target = message.details.target === 'sender' ? _sender.tab : await resolveDebugPermissionTargetTab()
          if (target?.id == null) {
            sendResponse({
              ok: false,
              error: message.details.target === 'sender' ? 'No sender tab for prompt.' : 'No http(s) tab found. Open a storefront tab or use "Show modal here".',
            } satisfies ShellResponse)
            return
          }
          const focusTab = message.details.focusTab !== false
          if (focusTab) {
            await chrome.tabs.update(target.id, { active: true })
          } else {
            maybeRelayPermissionModalToSender(_sender, target.id, false)
          }
          const forcePrompt = message.details.forcePrompt !== false
          const scriptKey = await resolveDebugPermissionScriptKey(message.details.scriptKey)
          const file = message.details.file ?? '__debug-permission-test__.ts'
          const resource = message.details.resource.trim() || 'example.com'
          const prompts = message.details.batch
            ? ([
                { capability: 'network' as const, resource },
                { capability: 'clipboard-write' as const, resource: '*' },
                { capability: 'open-tab' as const, resource },
              ] as const)
            : ([{ capability: message.details.capability, resource: message.details.resource }] as const)
          let lastAllowed = false
          for (const row of prompts) {
            lastAllowed = await ensureScriptPermissionForTab(
              target.id,
              {
                scriptKey,
                file,
                capability: row.capability,
                resource: row.resource,
              },
              { forcePrompt }
            )
          }
          const tabHint = target.title ? `"${target.title.slice(0, 48)}"` : `tab ${target.id}`
          const outcome = lastAllowed ? 'allowed' : 'denied/dismissed'
          sendResponse({
            ok: true,
            allowed: lastAllowed,
            message: message.details.batch
              ? `${focusTab ? `Switched to ${tabHint}. ` : ''}Batch prompt finished (last: ${outcome}).`
              : `${focusTab ? `Switched to ${tabHint}. ` : ''}Prompt finished (${outcome}).`,
          } satisfies ShellResponse)
          return
        }
        case 'DEBUG_CLEAR_TAB_SESSION_PERMISSIONS': {
          const tab = await resolveDebugPermissionTargetTab()
          if (tab?.id == null) {
            sendResponse({ ok: false, error: 'No http(s) tab found.' } satisfies ShellResponse)
            return
          }
          clearSessionPermissionsForTab(tab.id)
          sendResponse({ ok: true, message: 'Tab session permissions cleared.' } satisfies ShellResponse)
          return
        }
        case 'DEBUG_RUN_GM_PERMISSION_TEST': {
          const tab = await resolveDebugPermissionTargetTab()
          if (tab?.id == null) {
            sendResponse({ ok: false, error: 'No http(s) tab found.' } satisfies ShellResponse)
            return
          }
          if (message.details?.focusTab) {
            await chrome.tabs.update(tab.id, { active: true })
          } else {
            maybeRelayPermissionModalToSender(_sender, tab.id, false)
          }
          const test = message.details?.test ?? 'xhr'
          const file = message.details?.file?.trim() || '__debug-permission-test__.ts'
          const relayedModal = !message.details?.focusTab && _sender.tab?.id != null && _sender.tab.id !== tab.id
          let withBody = ''
          let successMessage = ''

          if (test === 'clipboard-read') {
            withBody = `(function(){
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    throw new Error('navigator.clipboard.readText is unavailable on this page.');
  }
  void navigator.clipboard.readText().then(function(value) {
    console.log('[VWS debug] clipboard read:', value);
  }).catch(function(error) {
    console.error('[VWS debug] clipboard read failed', error);
  });
})();`
            successMessage = 'Read clipboard dispatched on target tab. Check DevTools console for the value (browser may prompt for clipboard-read).'
          } else if (test === 'clipboard-write') {
            const text = message.details?.text?.trim() || '[VWS debug] clipboard write test'
            withBody = `(function(){
  if (typeof enterScriptPermissionScope !== 'function' || typeof GM_setClipboard !== 'function') {
    throw new Error('GM APIs not available — open a page with MagickMonkey shell active.');
  }
  enterScriptPermissionScope(${JSON.stringify(file)}, 'debug');
  GM_setClipboard(${JSON.stringify(text)}, undefined, function() {
    console.log('[VWS debug] GM_setClipboard allowed:', ${JSON.stringify(text)});
    exitScriptPermissionScope();
  });
})();`
            successMessage = relayedModal
              ? 'GM_setClipboard test dispatched. Permission modal should appear on this tab.'
              : 'GM_setClipboard test dispatched. Check the target tab for the permission modal, then verify paste.'
          } else {
            const resource = message.details?.resource?.trim() || 'example.com'
            const url = resource.includes('://') ? resource : `https://${resource}/`
            withBody = `(function(){
  if (typeof enterScriptPermissionScope !== 'function' || typeof GM_xmlhttpRequest !== 'function') {
    throw new Error('GM APIs not available — open a page with MagickMonkey shell active.');
  }
  enterScriptPermissionScope(${JSON.stringify(file)}, 'debug');
  GM_xmlhttpRequest({
    method: 'GET',
    url: ${JSON.stringify(url)},
    onload: function(){ console.log('[VWS debug] GM_xmlhttpRequest allowed'); exitScriptPermissionScope(); },
    onerror: function(e){ console.error('[VWS debug] GM_xmlhttpRequest denied', e); exitScriptPermissionScope(); }
  });
})();`
            successMessage = relayedModal
              ? 'GM_xmlhttpRequest test dispatched. Permission modal should appear on this tab.'
              : 'GM_xmlhttpRequest test dispatched. Check the target tab for the permission modal.'
          }

          const result = await executeInMainWorldScriptForTab(tab.id, 'global', { withBody })
          if (!result.ok) {
            sendResponse({ ok: false, error: result.message } satisfies ShellResponse)
            return
          }
          sendResponse({ ok: true, message: successMessage } satisfies ShellResponse)
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
          const cleared = await clearAllRuntimeCachesForEnabledScriptKeys()
          await refreshScriptListsForEnabledScriptKeys()
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
        case 'EXECUTE_USER_SCRIPT': {
          const tabId = _sender?.tab?.id
          const tabUrl = _sender?.tab?.url ?? ''
          if (tabId == null) {
            sendResponse({ ok: false, error: 'No sender tab for main-world execute.' } satisfies ShellResponse)
            return
          }
          const { mode } = message.details
          const source = mode === 'preset' ? { decls: message.details.decls, presetCode: message.details.presetCode } : { withBody: message.details.withBody }
          const result = await executeInMainWorldScriptForTab(tabId, mode, source)
          if (result.ok) {
            await disableCspStripForPageUrl(tabUrl)
            sendResponse({ ok: true, message: 'Main-world execute complete.' } satisfies ShellResponse)
            return
          }
          if (result.cspBlocked) {
            const reload = await reloadTabOnceForCsp(tabId, tabUrl)
            if (reload === 'reloaded') {
              sendResponse({ ok: true, message: CSP_RELOAD_SCHEDULED_MESSAGE } satisfies ShellResponse)
              return
            }
            await disableCspStripForPageUrl(tabUrl)
            markTabTriggerError(tabId, tabUrl)
            await updateBadgeForTab(tabId, tabUrl)
            sendResponse({
              ok: false,
              error: 'CSP blocked after tab reload; preset still cannot execute on this page.',
            } satisfies ShellResponse)
            return
          }
          markTabTriggerError(tabId, tabUrl)
          await disableCspStripForPageUrl(tabUrl)
          await updateBadgeForTab(tabId, tabUrl)
          sendResponse({ ok: false, error: result.message } satisfies ShellResponse)
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
