/**
 * Page-world entry: GM APIs + launcher (injected by content bridge).
 */

import { extensionLogger } from '@ext/shared/logger'
import { shouldExtensionCollectDebugLogs, syncShellLogOutputModeFromGmStore } from '@ext/shared/shell-log-output-cache'
import type { PageBootstrapConfig, ScriptKeyBootstrapEntry } from '@ext/types'
import { installCspExtensionBridgeResponseListener } from '@shared/csp-script-executor'
import { BOOT_LOG_KEY } from '@shared/launcher-constants'
import { setPermissionTrustScriptKeys } from '@shared/script-permission-scope'

import { flushBootDebugLogs } from '../bridge/debug-log-relay'
import { buildLauncherUrls } from './config'
import { installGmApiOnPage } from './gm-bridge'
import { startLauncher } from './launcher-runtime'
import { mergeScriptKeyEnabledScripts } from './merge-enabled-scripts'
import { setPageBridgeToken } from './page-bridge-client'
import { hydratePagePermissionAllowKeys } from './page-permission-allow-cache'
import { installPagePermissionAllowSyncListener } from './permission-allow-sync-listener'
import { seedScriptConnectPermissions } from './script-permission-scope'
import { installTrustPermissionScopeHook } from './trust-permission-page-seed'

function loadBootstrapData(): void {
  if (window.__VWS_PAGE_CONFIG__) {
    return
  }

  const script = document.currentScript as HTMLScriptElement | null
  const bootstrapId = script?.dataset.vwsBootstrapId
  if (!bootstrapId) {
    return
  }

  const data = document.getElementById(bootstrapId)
  if (!data?.textContent) {
    return
  }

  try {
    const parsed = JSON.parse(data.textContent) as {
      config?: PageBootstrapConfig
      gmStore?: Window['__VWS_GM_STORE__']
      bridgeToken?: string
      permissionAllowKeys?: string[]
    }
    window.__VWS_PAGE_CONFIG__ = parsed.config
    window.__VWS_GM_STORE__ = parsed.gmStore ?? {}
    if (typeof parsed.bridgeToken === 'string' && parsed.bridgeToken) {
      setPageBridgeToken(parsed.bridgeToken)
    }
    if (Array.isArray(parsed.permissionAllowKeys)) {
      hydratePagePermissionAllowKeys(parsed.permissionAllowKeys)
    }
    if (Array.isArray(parsed.config?.permissionTrustScriptKeys)) {
      setPermissionTrustScriptKeys(parsed.config.permissionTrustScriptKeys)
    }
  } catch (error) {
    extensionLogger.error('Failed to parse VWS bootstrap data:', error)
  } finally {
    data.remove()
  }
}

function resolveBootstrapEntries(config: PageBootstrapConfig): ScriptKeyBootstrapEntry[] {
  if (config.scriptKeys?.length) {
    return config.scriptKeys
  }
  if (config.baseUrl && config.scriptKey) {
    return [
      {
        scriptKey: config.scriptKey,
        baseUrl: config.baseUrl,
        gmScope: config.scriptKey.slice(0, 8),
        developMode: config.developMode !== false,
        enabledScripts: {},
      },
    ]
  }
  return []
}

function startLauncherForEntry(entry: ScriptKeyBootstrapEntry, gm: ReturnType<typeof installGmApiOnPage>, mergedEnabledScripts: Record<string, boolean>): void {
  const shortKey = entry.scriptKey.length > 8 ? `${entry.scriptKey.slice(0, 8)}…` : entry.scriptKey
  const urls = buildLauncherUrls({
    baseUrl: entry.baseUrl,
    scriptKey: entry.scriptKey,
    developMode: entry.developMode,
  })
  startLauncher(urls, gm, {
    scriptKey: entry.scriptKey,
    gmScope: entry.gmScope,
    enabledScripts: { ...entry.enabledScripts, ...mergedEnabledScripts },
    contentHashByFile: entry.contentHashByFile,
    acceptAlphaByFile: entry.acceptAlphaByFile,
    acceptAlpha: entry.acceptAlpha === true,
    logPrefix: `[ModuleLoad][${shortKey}]`,
  })
}

function main(): void {
  installCspExtensionBridgeResponseListener()
  loadBootstrapData()
  syncShellLogOutputModeFromGmStore()

  const config = window.__VWS_PAGE_CONFIG__
  const entries = config ? resolveBootstrapEntries(config) : []
  if (entries.length === 0) {
    extensionLogger.warn('Missing __VWS_PAGE_CONFIG__ scriptKeys. Configure Servers and reload.')
    return
  }

  window.__VWS_STARTED_SCRIPT_KEYS__ ??= []
  const started = window.__VWS_STARTED_SCRIPT_KEYS__

  const gm = installGmApiOnPage()
  installPagePermissionAllowSyncListener()
  installTrustPermissionScopeHook()
  ;(globalThis as Record<string, unknown>).seedScriptConnectPermissions = seedScriptConnectPermissions
  const mergedEnabledScripts = mergeScriptKeyEnabledScripts(entries)

  for (const entry of entries) {
    if (started.includes(entry.scriptKey)) {
      extensionLogger.debug(`Launcher already started for scriptKey ${entry.scriptKey}, skipping duplicate.`)
      continue
    }
    started.push(entry.scriptKey)

    try {
      startLauncherForEntry(entry, gm, mergedEnabledScripts)
    } catch (error) {
      extensionLogger.error(`Failed to start launcher for scriptKey ${entry.scriptKey}:`, error)
    }
  }
}

function replayBootDebugLogs(): void {
  if (!shouldExtensionCollectDebugLogs()) {
    return
  }
  const raw = (globalThis as Record<string, unknown>)[BOOT_LOG_KEY]
  if (!Array.isArray(raw) || raw.length === 0) {
    return
  }
  flushBootDebugLogs(raw as Array<{ t?: number; level?: string; message?: string }>)
}

main()
queueMicrotask(() => replayBootDebugLogs())
