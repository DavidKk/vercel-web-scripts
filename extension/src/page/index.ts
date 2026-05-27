/**
 * Page-world entry: GM APIs + launcher (injected by content bridge).
 */

import { extensionLogger } from '@ext/shared/logger'

import { buildLauncherUrls } from './config'
import { installGmApiOnPage } from './gm-bridge'
import { startLauncher } from './launcher-runtime'

declare global {
  interface Window {
    __VWS_PAGE_CONFIG__?: {
      baseUrl: string
      scriptKey: string
      developMode: boolean
      extensionVersion?: string
    }
  }
}

function main(): void {
  const config = window.__VWS_PAGE_CONFIG__
  if (!config?.baseUrl || !config.scriptKey) {
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
