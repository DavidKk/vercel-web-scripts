/**
 * Isolated content script: storage/XHR bridge + inject page-world launcher.
 */

import { loadExtensionRules, shouldInjectOnUrl } from '@ext/shared/extension-storage'

import type { GMRequestDetails } from '../page/gm-types'
import type { ExtensionConfig, PageBootstrapConfig } from '../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types'

const REQUEST_EVENT = 'vws-gm-request'
const RESPONSE_EVENT = 'vws-gm-response'
const STORAGE_CHANGED_EVENT = 'vws-gm-storage-changed'
const GM_STORAGE_PREFIX = 'vws_gm_'

function storageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
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
  const inline = document.createElement('script')
  inline.textContent = `window.__VWS_PAGE_CONFIG__ = ${JSON.stringify(config)}; window.__VWS_GM_STORE__ = ${JSON.stringify(gmStore)};`
  ;(document.documentElement || document.head || document.body).appendChild(inline)
  inline.remove()

  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('page-launcher.js')
  script.async = false
  ;(document.documentElement || document.head || document.body).appendChild(script)
}

async function handleXhr(details: GMRequestDetails): Promise<{ status: number; responseText: string; responseHeaders?: string }> {
  const method = (details.method ?? 'GET').toUpperCase()
  const headers = new Headers(details.headers ?? {})
  const res = await fetch(details.url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : details.data,
    credentials: 'omit',
  })
  const responseText = await res.text()
  const responseHeaders = Array.from(res.headers.entries())
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n')
  return { status: res.status, responseText, responseHeaders }
}

function respond(id: number, result?: unknown, error?: string): void {
  window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: { id, result, error } }))
}

async function bootstrap(): Promise<void> {
  const url = typeof location !== 'undefined' ? location.href : ''
  const rules = await loadExtensionRules()
  if (!shouldInjectOnUrl(rules, url)) {
    return
  }

  const [config, gmStore] = await Promise.all([loadConfig(), loadGmStore()])
  const manifest = chrome.runtime.getManifest()

  injectPageScript(
    {
      ...config,
      extensionVersion: manifest.version ?? '0.0.0',
    },
    gmStore
  )

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    for (const [fullKey, change] of Object.entries(changes)) {
      if (!fullKey.startsWith(GM_STORAGE_PREFIX)) continue
      const key = fullKey.slice(GM_STORAGE_PREFIX.length)
      window.dispatchEvent(
        new CustomEvent(STORAGE_CHANGED_EVENT, {
          detail: { key, oldValue: change.oldValue, newValue: change.newValue },
        })
      )
    }
  })

  window.addEventListener(REQUEST_EVENT, ((event: CustomEvent<{ id: number; method: string; args: unknown[] }>) => {
    const { id, method, args } = event.detail
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
  }) as EventListener)
}

void bootstrap()
