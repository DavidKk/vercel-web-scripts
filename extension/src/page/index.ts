/**
 * Page-world entry: GM APIs + launcher (injected by content bridge).
 */

import { extensionLogger } from '@ext/shared/logger'

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
      config?: Window['__VWS_PAGE_CONFIG__']
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

function main(): void {
  if (window.__VWS_PAGE_LAUNCHER_STARTED__) {
    extensionLogger.debug('Page launcher already started, skipping duplicate injection.')
    return
  }
  window.__VWS_PAGE_LAUNCHER_STARTED__ = true

  loadBootstrapData()

  const config = window.__VWS_PAGE_CONFIG__
  if (!config?.baseUrl || !config.scriptKey) {
    window.__VWS_PAGE_LAUNCHER_STARTED__ = false
    extensionLogger.warn('Missing __VWS_PAGE_CONFIG__ (baseUrl / scriptKey). Open extension options.')
    return
  }

  const gm = installGmApiOnPage()
  const urls = buildLauncherUrls({
    baseUrl: config.baseUrl,
    scriptKey: config.scriptKey,
    developMode: config.developMode !== false,
  })
  startLauncher(urls, gm)
}

main()
