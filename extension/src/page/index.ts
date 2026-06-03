/**
 * Page-world entry: GM APIs + launcher (injected by content bridge).
 */

import { extensionLogger } from '@ext/shared/logger'
import { syncShellLogOutputModeFromGmStore } from '@ext/shared/shell-log-output-cache'
import type { PageBootstrapConfig, ScriptKeyBootstrapEntry } from '@ext/types'

import { buildLauncherUrls } from './config'
import { installGmApiOnPage } from './gm-bridge'
import { startLauncher } from './launcher-runtime'

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
    }
    window.__VWS_PAGE_CONFIG__ = parsed.config
    window.__VWS_GM_STORE__ = parsed.gmStore ?? {}
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

function startLauncherForEntry(entry: ScriptKeyBootstrapEntry, gm: ReturnType<typeof installGmApiOnPage>): void {
  const shortKey = entry.scriptKey.length > 8 ? `${entry.scriptKey.slice(0, 8)}…` : entry.scriptKey
  const urls = buildLauncherUrls({
    baseUrl: entry.baseUrl,
    scriptKey: entry.scriptKey,
    developMode: entry.developMode,
  })
  startLauncher(urls, gm, {
    scriptKey: entry.scriptKey,
    gmScope: entry.gmScope,
    enabledScripts: entry.enabledScripts,
    logPrefix: `[ModuleLoad][${shortKey}]`,
  })
}

function main(): void {
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

  for (const entry of entries) {
    if (started.includes(entry.scriptKey)) {
      extensionLogger.debug(`Launcher already started for scriptKey ${entry.scriptKey}, skipping duplicate.`)
      continue
    }
    started.push(entry.scriptKey)

    try {
      startLauncherForEntry(entry, gm)
    } catch (error) {
      extensionLogger.error(`Failed to start launcher for scriptKey ${entry.scriptKey}:`, error)
    }
  }
}

main()
