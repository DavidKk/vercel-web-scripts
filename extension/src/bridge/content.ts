/**
 * Isolated content script: storage/XHR bridge + inject page-world launcher.
 */

import type { GMRequestDetails } from '../page/gm-types'
import type { ShellResponse } from '../shared/messages'
import type { ExtensionConfig, PageBootstrapConfig } from '../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types'

const REQUEST_EVENT = 'vws-gm-request'
const RESPONSE_EVENT = 'vws-gm-response'
const STORAGE_CHANGED_EVENT = 'vws-gm-storage-changed'
const BRIDGE_MESSAGE_SOURCE = 'vws-extension-bridge'
const GM_STORAGE_PREFIX = 'vws_gm_'
const BOOTSTRAP_DATA_PREFIX = 'vws-bootstrap-data-'
const LAUNCHER_SCRIPT_PREFIX = 'vws-page-launcher-'

function storageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
}

function getRuntimeId(): string | null {
  try {
    return chrome.runtime?.id ?? null
  } catch {
    return null
  }
}

async function loadConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY)
  const raw = result[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined
  if (raw?.baseUrl && raw?.scriptKey) {
    return raw
  }
  return DEFAULT_CONFIG
}

async function loadGmStore(): Promise<Record<string, unknown>> {
  const all = await chrome.storage.local.get(null)
  const store: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(GM_STORAGE_PREFIX)) {
      store[k.slice(GM_STORAGE_PREFIX.length)] = v
    }
  }
  return store
}

function injectPageScript(config: PageBootstrapConfig, gmStore: Record<string, unknown>): void {
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
  data.textContent = JSON.stringify({ config, gmStore })
  ;(document.documentElement || document.head || document.body).appendChild(data)

  const script = document.createElement('script')
  script.id = launcherId
  script.src = chrome.runtime.getURL('page-launcher.js')
  script.async = false
  script.dataset.vwsBootstrapId = bootstrapId
  ;(document.documentElement || document.head || document.body).appendChild(script)
}

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

async function handleXhr(details: GMRequestDetails): Promise<{ status: number; responseText: string; responseHeaders?: string }> {
  const response = (await chrome.runtime.sendMessage({
    type: 'GM_XHR',
    details: {
      method: details.method,
      url: details.url,
      headers: details.headers,
      data: details.data,
      timeout: details.timeout,
      responseType: details.responseType,
    },
  })) as ShellResponse
  if (!response?.ok || !('xhr' in response)) {
    throw new Error(response?.ok === false ? response.error : 'GM_XHR failed')
  }
  return response.xhr
}

function respond(id: number, result?: unknown, error?: string): void {
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: RESPONSE_EVENT, payload: { id, result, error } }, '*')
}

function postStorageChanged(key: string, oldValue: unknown, newValue: unknown): void {
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: STORAGE_CHANGED_EVENT, payload: { key, oldValue, newValue } }, '*')
}

function isRequestDetail(value: unknown): value is { id: number; method: string; args: unknown[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'number' &&
    typeof (value as { method?: unknown }).method === 'string' &&
    Array.isArray((value as { args?: unknown }).args)
  )
}

function handleBridgeRequest(value: unknown): void {
  if (!isRequestDetail(value)) {
    return
  }
  const { id, method, args } = value
  void (async () => {
    try {
      if (method === 'setValue') {
        const [key, value] = args as [string, unknown]
        await chrome.storage.local.set({ [storageKey(key)]: value })
        respond(id, true)
        return
      }
      if (method === 'deleteValue') {
        const [key] = args as [string]
        await chrome.storage.local.remove(storageKey(key))
        respond(id, true)
        return
      }
      if (method === 'xhr') {
        const [details] = args as [GMRequestDetails]
        const result = await handleXhr(details)
        respond(id, result)
        return
      }
      respond(id, undefined, `Unknown method: ${method}`)
    } catch (e) {
      respond(id, undefined, e instanceof Error ? e.message : String(e))
    }
  })()
}

async function bootstrap(): Promise<void> {
  if (!getRuntimeId()) {
    return
  }
  const url = typeof location !== 'undefined' ? location.href : ''
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return
  }

  const [config, gmStore] = await Promise.all([loadConfig(), loadGmStore()])
  const manifest = chrome.runtime.getManifest()
  const bootstrapConfig = {
    ...config,
    extensionVersion: manifest.version ?? '0.0.0',
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    for (const [fullKey, change] of Object.entries(changes)) {
      if (!fullKey.startsWith(GM_STORAGE_PREFIX)) continue
      const key = fullKey.slice(GM_STORAGE_PREFIX.length)
      postStorageChanged(key, change.oldValue, change.newValue)
    }
  })

  window.addEventListener(REQUEST_EVENT, ((event: CustomEvent<{ id: number; method: string; args: unknown[] }>) => {
    handleBridgeRequest(event.detail)
  }) as EventListener)

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return
    }
    const { source, type, payload } = event.data as { source?: unknown; type?: unknown; payload?: unknown }
    if (source !== BRIDGE_MESSAGE_SOURCE || type !== REQUEST_EVENT) {
      return
    }
    handleBridgeRequest(payload)
  })

  await waitForDocumentBody()
  injectPageScript(bootstrapConfig, gmStore)
}

void bootstrap()
