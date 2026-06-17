import type { PageBootstrapConfig } from '../types'
import { getBridgeToken } from './bridge-token'
import { BOOTSTRAP_DATA_PREFIX, LAUNCHER_SCRIPT_PREFIX } from './constants'
import { getExtensionResourceUrl, getRuntimeId } from './extension-context'

function waitForDocumentBody(): Promise<void> {
  if (document.body) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.body) {
        return
      }
      observer.disconnect()
      resolve()
    })
    observer.observe(document.documentElement || document, { childList: true, subtree: true })
  })
}

function injectPageScript(config: PageBootstrapConfig, gmStore: Record<string, unknown>, permissionAllowKeys: string[]): void {
  const runtimeId = getRuntimeId()
  if (!runtimeId) {
    return
  }
  const bootstrapId = `${BOOTSTRAP_DATA_PREFIX}${runtimeId}`
  const launcherId = `${LAUNCHER_SCRIPT_PREFIX}${runtimeId}`
  if (document.getElementById(launcherId)) {
    return
  }

  const existing = document.getElementById(bootstrapId)
  if (existing) {
    existing.remove()
  }

  const data = document.createElement('template')
  data.id = bootstrapId
  data.textContent = JSON.stringify({ config, gmStore, bridgeToken: getBridgeToken(), permissionAllowKeys })
  ;(document.documentElement || document.head || document.body).appendChild(data)

  const script = document.createElement('script')
  script.id = launcherId
  const launcherUrl = getExtensionResourceUrl('page-launcher.js')
  if (!launcherUrl) {
    return
  }
  script.src = launcherUrl
  script.async = false
  script.dataset.vwsBootstrapId = bootstrapId
  ;(document.documentElement || document.head || document.body).appendChild(script)
}

/** Load bootstrap payload and inject page-world launcher when extension is configured. */
export async function injectPageLauncherWhenReady(bootstrapConfig: PageBootstrapConfig, gmStore: Record<string, unknown>, permissionAllowKeys: string[] = []): Promise<void> {
  await waitForDocumentBody()
  injectPageScript(bootstrapConfig, gmStore, permissionAllowKeys)
}
