import {
  countEnabledScriptsForEnabledScriptKeys,
  ensureExtensionServicesState,
  getEnabledScriptKeys,
  getShellGloballyEnabled,
  getShellLogOutputMode,
  getShellNetworkEnabled,
  isShellEnabledForTab,
  loadExtensionConfig,
  loadGmScopeForScriptKey,
  resolvePresetAndRuntimeStage,
} from '@ext/shared/extension-storage'
import type { ShellStatus } from '@ext/shared/messages'
import { ensureTabTriggerHydrated, getTabTriggerCount, hydrateTabTriggerCounts } from '@ext/shared/tab-trigger-badge'

import { fetchExtensionUpdateInfo } from '../shared/extension-update-check'
import { refreshIncognitoLogCollectionCache, refreshShellLogOutputModeCache } from '../shared/shell-log-output-cache'
import { getActiveTab } from './background-tab-utils'
import { applyDefaultBadgeColors, createBadgeRefreshHandler } from './badge-controller'
import { clearDebugLogs } from './debug-log-store'
import { hydrateScriptPermissionSession } from './permission-manager'

export const updateBadgeForTab = createBadgeRefreshHandler(isShellEnabledForTab)

export interface BuildStatusOptions {
  /** When false, skip manifest/extension network checks (fast path for popup interactions). */
  network?: boolean
}

export async function buildStatus(options?: BuildStatusOptions): Promise<ShellStatus> {
  const allowNetwork = options?.network === true
  const tab = await getActiveTab()
  const [config, servicesState, networkEnabled, logOutputMode, scriptTotals] = await Promise.all([
    loadExtensionConfig(),
    ensureExtensionServicesState(),
    getShellNetworkEnabled(),
    getShellLogOutputMode(),
    countEnabledScriptsForEnabledScriptKeys({ incognito: tab?.incognito === true }),
  ])
  const gmScope = config.scriptKey ? await loadGmScopeForScriptKey(config.scriptKey, config.baseUrl) : ''
  const { presetVersion, runtimeStage } = await resolvePresetAndRuntimeStage(config, gmScope, {
    allowManifestFetch: allowNetwork && networkEnabled,
  })
  const url = tab?.url ?? ''
  const enabledServices = servicesState.services.filter((service) => service.enabled)
  const enabledScriptKeys = getEnabledScriptKeys(servicesState.services)
  const configured = scriptTotals.serverCount > 0
  if (tab?.id != null) {
    await ensureTabTriggerHydrated()
  }
  const triggeredCountOnActiveTab = tab?.id != null ? getTabTriggerCount(tab.id) : 0
  const shellGloballyEnabled = await getShellGloballyEnabled()
  const shellEnabledOnActiveTab = tab?.id != null ? await isShellEnabledForTab(tab.id) : shellGloballyEnabled
  const manifest = chrome.runtime.getManifest()
  const extensionVersion = manifest.version ?? '0.0.0'
  let extensionUpdateAvailable = false
  let latestExtensionVersion: string | null = null
  let extensionDownloadUrl: string | null = null
  if (allowNetwork && networkEnabled && config.baseUrl.trim()) {
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
    runtimeStage,
    shellEnabledOnActiveTab,
    shellGloballyEnabled,
  }
}

export async function refreshAllBadges(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(tabs.map((t) => (t.id != null ? updateBadgeForTab(t.id, t.url) : Promise.resolve())))
}

export async function initBackgroundDefaults(): Promise<void> {
  await Promise.all([refreshShellLogOutputModeCache(), refreshIncognitoLogCollectionCache()])
  await Promise.all([hydrateTabTriggerCounts(), hydrateScriptPermissionSession()])
  void applyDefaultBadgeColors()
  void refreshAllBadges()
}

export async function initExtensionInstall(): Promise<void> {
  clearDebugLogs()
  await initBackgroundDefaults()
}
