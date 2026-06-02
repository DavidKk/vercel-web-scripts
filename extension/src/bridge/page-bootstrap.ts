import { buildPageBootstrapConfig } from '../shared/extension-storage'
import { GM_STORAGE_PREFIX } from './constants'
import { getExtensionVersion, getRuntimeId, isExtensionContextInvalidated } from './extension-context'
import { loadGmStore, postStorageChanged } from './gm-storage-bridge'
import { injectPageLauncherWhenReady } from './page-injector'

function isHttpPageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
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

/** Load bootstrap config, wire GM storage sync, inject page launcher. */
export async function bootstrapPageBridge(): Promise<void> {
  if (!getRuntimeId()) {
    return
  }
  const url = typeof location !== 'undefined' ? location.href : ''
  if (!isHttpPageUrl(url)) {
    return
  }

  let bootstrapConfig: Awaited<ReturnType<typeof buildPageBootstrapConfig>>
  let gmStore: Record<string, unknown>
  try {
    const extensionVersion = getExtensionVersion()
    ;[bootstrapConfig, gmStore] = await Promise.all([buildPageBootstrapConfig(extensionVersion), loadGmStore()])
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return
    }
    throw error
  }

  if (!bootstrapConfig) {
    return
  }

  try {
    installGmStorageChangeListener()
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return
    }
    throw error
  }

  await injectPageLauncherWhenReady(bootstrapConfig, gmStore)
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
