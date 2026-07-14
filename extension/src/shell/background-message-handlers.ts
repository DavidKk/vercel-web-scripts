import { setBadgeRuntimeHint } from '@ext/shared/badge-runtime-hint'
import {
  addScriptKeyRule,
  clearAllRuntimeCachesForEnabledScriptKeys,
  disableShellForTab,
  disableShellGlobally,
  enableShellMaster,
  ensureExtensionServicesState,
  getEnabledScriptKeys,
  getIncognitoLogCollectionEnabled,
  getShellGloballyEnabled,
  getShellNetworkEnabled,
  isShellEnabledForTab,
  listScriptPermissionRegistryRows,
  loadLocalRulesForEnabledScriptKeys,
  loadQuickAddRuleContext,
  readScriptPermissionRegistry,
  refreshScriptListsForEnabledScriptKeys,
  removePersistentPermissionEntryByKey,
  removeScriptKeyRule,
  resetRuntimeStateForEnabledScriptKeys,
  resolveEditorServiceConfig,
  setIncognitoLogCollectionEnabled,
  setShellLogOutputMode,
  setShellNetworkEnabled,
  syncRulesForEnabledScriptKeys,
  writeScriptPermissionRegistry,
} from '@ext/shared/extension-storage'
import { focusOrOpenExtensionPage, focusOrOpenTab } from '@ext/shared/focus-or-open-tab'
import type { ShellMessage, ShellResponse } from '@ext/shared/messages'
import { invalidateTabMatchCache, scheduleTabMatchRefreshForEnabledScriptKeys } from '@ext/shared/tab-match-cache'
import {
  clearAllTabTriggerCounts,
  getTabBadgePhase,
  getTabTriggerCount,
  getTabTriggerHasError,
  incrementTabTriggerCount,
  markTabTriggerError,
  resetTabTriggerCountsForPageLoad,
  setTabBadgePhase,
} from '@ext/shared/tab-trigger-badge'

import { ensureRuntimeLoad } from '../runtime/module-loader'
import { extensionLogger, permissionLogger } from '../shared/logger'
import { refreshIncognitoLogCollectionCache, refreshShellLogOutputModeCache } from '../shared/shell-log-output-cache'
import { enrichDebugLogFromSender, handleBridgeXhr, handleCaptureVisibleTab, handleWebConnect } from './background-bridge'
import { handleDebugClearTabSessionPermissions, handleDebugPermissionPrompt, handleDebugRunGmPermissionTest } from './background-debug-permission'
import { buildStatus, refreshAllBadges, updateBadgeForTab } from './background-status'
import { getActiveTab, isReloadableTabUrl, reloadAllReloadableTabs, reloadTab } from './background-tab-utils'
import { applyBootstrapRuntimeHint, scheduleInitializingIdleFallback } from './badge-controller'
import { disableCspStripForPageUrl } from './csp-dnr-rules'
import { reloadTabOnceForCsp } from './csp-tab-reload'
import { CSP_RELOAD_SCHEDULED_MESSAGE, executeInMainWorldScriptForTab } from './csp-user-script-executor'
import { appendDebugLog, clearDebugLogs, getDebugLogSnapshot, initDebugLogStore, normalizeDebugLogAppendDetails } from './debug-log-store'
import {
  applyPermissionModalResult,
  clearAllScriptPermissions,
  ensureScriptPermissionForTab,
  listAllowedPermissionKeysForTab,
  listPermissionHistoryEntries,
  listSessionPermissionEntries,
  PERMISSION_MODAL_RESULT_MESSAGE_TYPE,
  PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE,
  removeSessionPermissionByKey,
  removeSessionPermissionByKeyAllTabs,
  seedSessionConnectAllows,
  seedTrustedTier1Permissions,
  updateAdminScriptPermissionEntriesBatch,
  updateAdminScriptPermissionEntry,
} from './permission-manager'
import { handleWebMcpShellMessage, isWebMcpShellMessage } from './webmcp/webmcp-message-handlers'

export async function handleShellMessage(message: ShellMessage, sender: chrome.runtime.MessageSender): Promise<ShellResponse | void> {
  if (isWebMcpShellMessage(message)) {
    return handleWebMcpShellMessage(message)
  }

  switch (message.type) {
    case 'GM_XHR': {
      return handleBridgeXhr(message.details, sender.tab?.id)
    }
    case 'CAPTURE_VISIBLE_TAB': {
      try {
        return await handleCaptureVisibleTab(message, sender.tab?.id, sender.tab?.windowId, sender.tab?.url)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        return { ok: false, error: msg }
      }
    }
    case 'RUNTIME_ENSURE_LOAD': {
      const tabId = sender.tab?.id
      if (tabId == null) {
        return { ok: false, error: 'No tab for runtime load.' }
      }
      try {
        const runtimeLoadResults = await ensureRuntimeLoad({
          tabId,
          pageUrl: message.details.pageUrl,
          entries: message.details.entries,
        })
        return { ok: true, runtimeLoadResults }
      } catch (error) {
        extensionLogger.error('[ModuleLoad] RUNTIME_ENSURE_LOAD failed:', error)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
    case 'SCRIPT_PERMISSION_ENSURE': {
      const tabId = sender.tab?.id
      if (tabId == null) {
        permissionLogger.warn('ensure:no-tab')
        return { ok: false, error: 'No tab for permission request.' }
      }
      permissionLogger.debug('message:SCRIPT_PERMISSION_ENSURE', {
        tabId,
        file: message.request.file,
        capability: message.request.capability,
        resource: message.request.resource,
      })
      const allowed = await ensureScriptPermissionForTab(tabId, message.request)
      return { ok: true, allowed }
    }
    case PERMISSION_MODAL_RESULT_MESSAGE_TYPE: {
      await applyPermissionModalResult(message.payload)
      return { ok: true }
    }
    case 'GET_PAGE_PERMISSION_ALLOW_KEYS': {
      const tabId = sender.tab?.id
      if (tabId == null) {
        return { ok: false, error: 'No tab for permission allow keys.' }
      }
      const permissionAllowKeys = await listAllowedPermissionKeysForTab(tabId)
      return { ok: true, permissionAllowKeys }
    }
    case 'CLEAR_ALL_SCRIPT_PERMISSIONS': {
      await clearAllScriptPermissions()
      return { ok: true, message: 'All script permissions cleared.' }
    }
    case 'GET_SCRIPT_PERMISSION_REGISTRY': {
      const registry = await readScriptPermissionRegistry()
      return {
        ok: true,
        scriptPermissionEntries: listScriptPermissionRegistryRows(registry),
        sessionPermissionEntries: listSessionPermissionEntries(),
        permissionHistoryEntries: await listPermissionHistoryEntries(),
      }
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
      return { ok: true, removed: removedRegistry || removedSession }
    }
    case 'REMOVE_SESSION_PERMISSION_ENTRY': {
      const removed = removeSessionPermissionByKey(message.tabId, message.key)
      return { ok: true, removed }
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
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    case 'UPDATE_SCRIPT_PERMISSION_ENTRIES': {
      try {
        await updateAdminScriptPermissionEntriesBatch(message.updates)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
    case 'SCRIPT_PERMISSION_SEED_CONNECTS': {
      const tabId = sender.tab?.id
      if (tabId == null) {
        return { ok: false, error: 'No tab for connect seed.' }
      }
      await seedSessionConnectAllows(tabId, message.context, message.connects)
      return { ok: true }
    }
    case 'SCRIPT_PERMISSION_SEED_TRUST_TIER1': {
      const tabId = sender.tab?.id
      if (tabId == null) {
        return { ok: false, error: 'No tab for trust tier-1 seed.' }
      }
      const grantedKeys = await seedTrustedTier1Permissions(tabId, message.context)
      return { ok: true, grantedKeys }
    }
    case 'DEBUG_PERMISSION_PROMPT': {
      return handleDebugPermissionPrompt(message, sender)
    }
    case 'DEBUG_CLEAR_TAB_SESSION_PERMISSIONS': {
      return handleDebugClearTabSessionPermissions()
    }
    case 'DEBUG_RUN_GM_PERMISSION_TEST': {
      return handleDebugRunGmPermissionTest(message, sender)
    }
    case 'WEB_CONNECT_EXTENSION': {
      return handleWebConnect(message.details)
    }
    case 'GET_STATUS': {
      return { ok: true, status: await buildStatus({ network: message.network }) }
    }
    case 'GET_SHELL_ENABLED_FOR_SENDER': {
      const tabId = sender?.tab?.id
      if (tabId == null) {
        return { ok: true, shellEnabled: await getShellGloballyEnabled() }
      }
      return { ok: true, shellEnabled: await isShellEnabledForTab(tabId) }
    }
    case 'SET_NETWORK': {
      const previous = await getShellNetworkEnabled()
      await setShellNetworkEnabled(message.enabled)
      const next = await getShellNetworkEnabled()
      extensionLogger.debug(`[Shell network] toggle requested=${message.enabled} previous=${previous} next=${next}`)
      return { ok: true }
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
        return { ok: true, message: 'Extension enabled.' }
      }
      if (message.scope === 'global') {
        await disableShellGlobally()
        await reloadAllReloadableTabs()
        await refreshAllBadges()
        return { ok: true, message: 'Extension disabled on all tabs.' }
      }
      if (message.scope === 'tab') {
        if (tab?.id == null) {
          return { ok: false, error: 'No active tab.' }
        }
        await disableShellForTab(tab.id)
        await reloadTab(tab)
        await refreshAllBadges()
        return { ok: true, message: 'Extension disabled on this tab.' }
      }
      return { ok: false, error: 'Choose this tab or all tabs to disable.' }
    }
    case 'SET_LOG_OUTPUT_MODE': {
      await setShellLogOutputMode(message.mode)
      await refreshShellLogOutputModeCache()
      extensionLogger.debug(`[Shell log output] mode=${message.mode}`)
      return { ok: true }
    }
    case 'UPDATE_RUNTIME': {
      const enabledKeys = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
      if (enabledKeys.length === 0) {
        return { ok: false, error: 'Configure at least one enabled service first.' }
      }
      const cleared = await clearAllRuntimeCachesForEnabledScriptKeys()
      await refreshScriptListsForEnabledScriptKeys()
      await invalidateTabMatchCache()
      await clearAllTabTriggerCounts()
      await setBadgeRuntimeHint('update')
      const activeAfterUpdate = await getActiveTab()
      if (activeAfterUpdate?.id != null) {
        await updateBadgeForTab(activeAfterUpdate.id, activeAfterUpdate.url)
      }
      await reloadTab(activeAfterUpdate)
      return {
        ok: true,
        message: cleared > 1 ? `Runtime cache cleared for ${cleared} script keys.` : 'Runtime cache cleared.',
      }
    }
    case 'RESET_RUNTIME': {
      const enabledKeys = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
      if (enabledKeys.length === 0) {
        return { ok: false, error: 'Configure at least one enabled service first.' }
      }
      await resetRuntimeStateForEnabledScriptKeys()
      await invalidateTabMatchCache()
      await clearAllTabTriggerCounts()
      await setBadgeRuntimeHint('reset')
      const activeAfterReset = await getActiveTab()
      if (activeAfterReset?.id != null) {
        await updateBadgeForTab(activeAfterReset.id, activeAfterReset.url)
      }
      await reloadTab(activeAfterReset)
      return {
        ok: true,
        message: enabledKeys.length > 1 ? `Runtime state reset for ${enabledKeys.length} script keys.` : 'Runtime state reset.',
      }
    }
    case 'OPEN_EDITOR': {
      const editorConfig = await resolveEditorServiceConfig()
      if (!editorConfig?.baseUrl) {
        return { ok: false, error: 'Configure at least one enabled service first.' }
      }
      await focusOrOpenTab(`${editorConfig.baseUrl.replace(/\/$/, '')}/editor`)
      return { ok: true }
    }
    case 'OPEN_SCRIPTS_PAGE': {
      await focusOrOpenExtensionPage('admin.html#scripts')
      return { ok: true }
    }
    case 'OPEN_RULES_PAGE': {
      await focusOrOpenExtensionPage('admin.html#rules')
      return { ok: true }
    }
    case 'OPEN_OPTIONS': {
      await focusOrOpenExtensionPage('admin.html#servers')
      return { ok: true }
    }
    case 'RELOAD_ACTIVE_TAB': {
      const tab = await getActiveTab()
      if (tab?.id == null) {
        return { ok: false, error: 'No active tab.' }
      }
      if (!isReloadableTabUrl(tab.url)) {
        return { ok: false, error: 'Cannot reload this tab (system pages are not supported).' }
      }
      await chrome.tabs.reload(tab.id)
      return { ok: true, message: 'Tab reloaded.' }
    }
    case 'SYNC_RULES': {
      const enabledKeys = getEnabledScriptKeys((await ensureExtensionServicesState()).services)
      if (enabledKeys.length === 0) {
        return { ok: false, error: 'Configure at least one enabled service first.' }
      }
      const results = await syncRulesForEnabledScriptKeys()
      const total = results.reduce((sum, row) => sum + row.count, 0)
      const tab = await getActiveTab()
      if (tab?.url?.startsWith('http')) {
        await scheduleTabMatchRefreshForEnabledScriptKeys(tab.url)
      }
      return {
        ok: true,
        message: results.length > 1 ? `Synced ${total} rule(s) across ${results.length} script keys.` : `Synced ${total} rule(s).`,
      }
    }
    case 'GET_QUICK_ADD_RULE_CONTEXT': {
      const tab = await getActiveTab()
      const activeTabUrl = tab?.url ?? ''
      const items = await loadQuickAddRuleContext(activeTabUrl)
      return {
        ok: true,
        quickAddRuleContext: {
          activeTabUrl,
          items,
        },
      }
    }
    case 'GET_LOCAL_RULES': {
      const localRules = await loadLocalRulesForEnabledScriptKeys()
      return {
        ok: true,
        localRules,
      }
    }
    case 'ADD_LOCAL_RULE': {
      const created = await addScriptKeyRule(message.details.scriptKey, message.details.script, message.details.wildcard, message.details.mode)
      const tab = await getActiveTab()
      if (tab?.url?.startsWith('http')) {
        await scheduleTabMatchRefreshForEnabledScriptKeys(tab.url)
      }
      return {
        ok: true,
        message: created ? 'Local rule added.' : 'Local rule already exists.',
        ruleMutation: { created },
      }
    }
    case 'REMOVE_LOCAL_RULE': {
      const removed = await removeScriptKeyRule(message.details.scriptKey, message.details.script, message.details.wildcard, message.details.mode)
      const tab = await getActiveTab()
      if (tab?.url?.startsWith('http')) {
        await scheduleTabMatchRefreshForEnabledScriptKeys(tab.url)
      }
      return {
        ok: true,
        message: removed ? 'Local rule removed.' : 'Local rule not found.',
        ruleMutation: { removed },
      }
    }
    case 'TAB_PAGE_LOAD': {
      const tab = sender?.tab
      if (tab?.id == null) {
        return { ok: true }
      }
      const url = tab.url ?? message.details.url
      resetTabTriggerCountsForPageLoad(tab.id, url)
      scheduleInitializingIdleFallback(tab.id, updateBadgeForTab)
      await updateBadgeForTab(tab.id, url)
      return { ok: true }
    }
    case 'PAGE_BOOTSTRAP_READY': {
      const tab = sender?.tab
      if (tab?.id == null) {
        return { ok: true }
      }
      const url = tab.url ?? message.details.url
      await applyBootstrapRuntimeHint(tab.id, url, updateBadgeForTab)
      if (getTabTriggerCount(tab.id) === 0 && !getTabTriggerHasError(tab.id)) {
        const phase = getTabBadgePhase(tab.id)
        if (phase !== 'reset-done' && phase !== 'update-done') {
          setTabBadgePhase(tab.id, url, 'idle')
        }
      }
      await updateBadgeForTab(tab.id, url)
      return { ok: true }
    }
    case 'PAGE_BOOTSTRAP_SKIPPED': {
      const tab = sender?.tab
      if (tab?.id == null) {
        return { ok: true }
      }
      const url = tab.url ?? message.details.url
      if (getTabTriggerCount(tab.id) === 0 && !getTabTriggerHasError(tab.id)) {
        setTabBadgePhase(tab.id, url, message.details.reason === 'no-config' ? 'no-config' : 'idle')
      }
      await updateBadgeForTab(tab.id, url)
      return { ok: true }
    }
    case 'SCRIPT_TRIGGERED': {
      const tab = sender?.tab
      if (tab?.id == null) {
        return { ok: true }
      }
      const { file, runAt, scriptKey } = message.details
      const dedupeKey = `${scriptKey ?? ''}|${file}|${runAt}`
      incrementTabTriggerCount(tab.id, tab.url, dedupeKey)
      await updateBadgeForTab(tab.id, tab.url)
      return { ok: true }
    }
    case 'SCRIPT_FAILED': {
      const tab = sender?.tab
      if (tab?.id == null) {
        return { ok: true }
      }
      markTabTriggerError(tab.id, tab.url)
      await updateBadgeForTab(tab.id, tab.url)
      return { ok: true }
    }
    case 'APPEND_DEBUG_LOG': {
      await initDebugLogStore()
      const entries = normalizeDebugLogAppendDetails(message.details).map((entry) => enrichDebugLogFromSender(entry, sender))
      appendDebugLog(entries)
      return { ok: true }
    }
    case 'GET_DEBUG_LOGS': {
      await initDebugLogStore()
      return { ok: true, debugLogs: getDebugLogSnapshot() }
    }
    case 'GET_INCOGNITO_LOG_COLLECTION': {
      return { ok: true, incognitoLogCollection: await getIncognitoLogCollectionEnabled() }
    }
    case 'SET_INCOGNITO_LOG_COLLECTION': {
      await setIncognitoLogCollectionEnabled(message.enabled)
      await refreshIncognitoLogCollectionCache()
      return { ok: true, incognitoLogCollection: message.enabled }
    }
    case 'CLEAR_DEBUG_LOGS': {
      clearDebugLogs()
      return { ok: true }
    }
    case 'ENSURE_CSP_STRIP_RELOAD_FOR_INJECTION': {
      const tabId = sender?.tab?.id
      const tabUrl = message.details.pageUrl || sender?.tab?.url || ''
      if (tabId == null || !tabUrl) {
        return { ok: false, error: 'No sender tab for CSP strip reload.' }
      }
      const reload = await reloadTabOnceForCsp(tabId, tabUrl)
      return { ok: true, cspReloadScheduled: reload === 'reloaded' }
    }
    case 'EXECUTE_USER_SCRIPT': {
      const tabId = sender?.tab?.id
      const tabUrl = sender?.tab?.url ?? ''
      if (tabId == null) {
        return { ok: false, error: 'No sender tab for main-world execute.' }
      }
      const { mode } = message.details
      const source = mode === 'preset' ? { decls: message.details.decls, presetCode: message.details.presetCode } : { withBody: message.details.withBody }
      const result = await executeInMainWorldScriptForTab(tabId, mode, source)
      if (result.ok) {
        await disableCspStripForPageUrl(tabUrl)
        return { ok: true, message: 'Main-world execute complete.' }
      }
      if (result.cspBlocked) {
        const reload = await reloadTabOnceForCsp(tabId, tabUrl)
        if (reload === 'reloaded') {
          return { ok: true, message: CSP_RELOAD_SCHEDULED_MESSAGE }
        }
        await disableCspStripForPageUrl(tabUrl)
        markTabTriggerError(tabId, tabUrl)
        await updateBadgeForTab(tabId, tabUrl)
        return {
          ok: false,
          error: 'CSP blocked after tab reload; preset still cannot execute on this page.',
        }
      }
      markTabTriggerError(tabId, tabUrl)
      await disableCspStripForPageUrl(tabUrl)
      await updateBadgeForTab(tabId, tabUrl)
      return { ok: false, error: result.message }
    }
    default:
      return { ok: false, error: 'Unknown message' }
  }
}
