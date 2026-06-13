import { buildPageBootstrapConfig } from '../shared/extension-storage'
import type { ShellResponse } from '../shared/messages'
import { GM_STORAGE_PREFIX } from './constants'
import { getExtensionVersion, getRuntimeId, isExtensionContextInvalidated } from './extension-context'
import { loadGmStore, postStorageChanged } from './gm-storage-bridge'
import { isHtmlDocumentForInjection } from './injection-gate'
import { injectPageLauncherWhenReady } from './page-injector'

function isHttpPageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

async function isCurrentTabShellEnabled(): Promise<boolean> {
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'GET_SHELL_ENABLED_FOR_SENDER' })) as ShellResponse
    if (!res.ok || !('shellEnabled' in res)) {
      return true
    }
    return res.shellEnabled !== false
  } catch (error) {
    isExtensionContextInvalidated(error)
    return true
  }
}

function installGmStorageChangeListener(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return
    }
    for (const [fullKey, change] of Object.entries(changes)) {
      if (!fullKey.startsWith(GM_STORAGE_PREFIX)) {
        continue
      }
      const key = fullKey.slice(GM_STORAGE_PREFIX.length)
      postStorageChanged(key, change.oldValue, change.newValue)
    }
  })
}

async function getCurrentTabIncognito(): Promise<boolean> {
  try {
    const tab = await chrome.tabs.getCurrent()
    return tab?.incognito === true
  } catch {
    return false
  }
}

/** Load bootstrap config, wire GM storage sync, inject page launcher. */
export async function bootstrapPageBridge(): Promise<void> {
  if (!getRuntimeId()) {
    return
  }
  const url = typeof location !== 'undefined' ? location.href : ''
  if (!isHttpPageUrl(url)) {
    return
  }
  if (!isHtmlDocumentForInjection()) {
    return
  }

  if (!(await isCurrentTabShellEnabled())) {
    return
  }

  let bootstrapConfig: Awaited<ReturnType<typeof buildPageBootstrapConfig>>
  let gmStore: Record<string, unknown>
  const incognito = await getCurrentTabIncognito()
  try {
    const extensionVersion = getExtensionVersion()
    ;[bootstrapConfig, gmStore] = await Promise.all([buildPageBootstrapConfig(extensionVersion, { incognito }), loadGmStore()])
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return
    }
    throw error
  }

  if (!bootstrapConfig) {
    return
  }

  const pageConfig = incognito ? { ...bootstrapConfig, incognito: true } : bootstrapConfig

  try {
    installGmStorageChangeListener()
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return
    }
    throw error
  }

  await injectPageLauncherWhenReady(pageConfig, gmStore)
}

/** Notify background that a top-level http(s) document loaded. */
export function notifyTabPageLoad(): void {
  const url = typeof location !== 'undefined' ? location.href : ''
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }
  if (!getRuntimeId()) {
    return
  }
  void chrome.runtime
    .sendMessage({
      type: 'TAB_PAGE_LOAD',
      details: { url },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}
