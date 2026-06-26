import type { RuntimeLoadResult } from '../runtime/loader-types'
import { buildPageBootstrapConfig } from '../shared/extension-storage'
import type { ShellResponse } from '../shared/messages'
import type { ScriptKeyBootstrapEntry } from '../types'
import { GM_STORAGE_PREFIX } from './constants'
import { getExtensionVersion, getRuntimeId, isExtensionContextInvalidated } from './extension-context'
import { loadGmStore, postStorageChanged } from './gm-storage-bridge'
import { isHtmlDocumentForInjection } from './injection-gate'
import { injectPageLauncherWhenReady } from './page-injector'
import { installRuntimeMessageRelay } from './runtime-relay'

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

function notifyBootstrapReady(url: string): void {
  void chrome.runtime
    .sendMessage({
      type: 'PAGE_BOOTSTRAP_READY',
      details: { url },
    } satisfies { type: 'PAGE_BOOTSTRAP_READY'; details: { url: string } })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

function notifyBootstrapSkipped(url: string, reason: 'no-config' | 'non-html'): void {
  void chrome.runtime
    .sendMessage({
      type: 'PAGE_BOOTSTRAP_SKIPPED',
      details: { url, reason },
    } satisfies { type: 'PAGE_BOOTSTRAP_SKIPPED'; details: { url: string; reason: 'no-config' | 'non-html' } })
    .catch((error) => {
      isExtensionContextInvalidated(error)
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
  if (!isHtmlDocumentForInjection()) {
    notifyBootstrapSkipped(url, 'non-html')
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
    notifyBootstrapSkipped(url, 'no-config')
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

  let permissionAllowKeys: string[] = []
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'GET_PAGE_PERMISSION_ALLOW_KEYS' })) as ShellResponse
    if (res.ok && 'permissionAllowKeys' in res && Array.isArray(res.permissionAllowKeys)) {
      permissionAllowKeys = res.permissionAllowKeys
    }
  } catch (error) {
    isExtensionContextInvalidated(error)
  }

  const runtimeLoadResults = await requestRuntimeEnsureLoad(pageConfig.scriptKeys, url)
  try {
    gmStore = await loadGmStore()
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return
    }
    throw error
  }

  await injectPageLauncherWhenReady(pageConfig, gmStore, permissionAllowKeys, runtimeLoadResults)
  installRuntimeMessageRelay()
  notifyBootstrapReady(url)
}

async function requestRuntimeEnsureLoad(entries: ScriptKeyBootstrapEntry[], pageUrl: string): Promise<RuntimeLoadResult[]> {
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'RUNTIME_ENSURE_LOAD',
      details: { pageUrl, entries },
    })) as ShellResponse
    if (res.ok && 'runtimeLoadResults' in res && Array.isArray(res.runtimeLoadResults)) {
      return res.runtimeLoadResults
    }
    return []
  } catch (error) {
    isExtensionContextInvalidated(error)
    return []
  }
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
