import type { GMRequestDetails } from '../page/gm-types'
import type { ShellResponse } from '../shared/messages'
import { BRIDGE_MESSAGE_SOURCE, GM_STORAGE_PREFIX, RESPONSE_EVENT, STORAGE_CHANGED_EVENT } from './constants'
import { isExtensionContextInvalidated } from './extension-context'

function storageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
}

export async function loadGmStore(): Promise<Record<string, unknown>> {
  try {
    const all = await chrome.storage.local.get(null)
    const store: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(GM_STORAGE_PREFIX)) {
        store[k.slice(GM_STORAGE_PREFIX.length)] = v
      }
    }
    return store
  } catch (error) {
    isExtensionContextInvalidated(error)
    throw error
  }
}

function respond(id: number, result?: unknown, error?: string): void {
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: RESPONSE_EVENT, payload: { id, result, error } }, '*')
}

export function postStorageChanged(key: string, oldValue: unknown, newValue: unknown): void {
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: STORAGE_CHANGED_EVENT, payload: { key, oldValue, newValue } }, '*')
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

function isRequestDetail(value: unknown): value is { id: number; method: string; args: unknown[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'number' &&
    typeof (value as { method?: unknown }).method === 'string' &&
    Array.isArray((value as { args?: unknown }).args)
  )
}

export function handleBridgeRequest(value: unknown): void {
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
