/**
 * GM_* APIs on the page (MAIN world). Storage and XHR are delegated to the isolated content-script bridge.
 */

import { gmLogger } from '@ext/shared/logger'

import type { GMApi, GMRequestDetails, GMValue } from './gm-types'

const REQUEST_EVENT = 'vws-gm-request'
const RESPONSE_EVENT = 'vws-gm-response'

declare global {
  interface Window {
    __VWS_GM_STORE__?: Record<string, GMValue>
    __VWS_PAGE_CONFIG__?: { extensionVersion?: string }
  }
}

let requestId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const changeListeners = new Map<string, Map<string, (name: string, oldValue: GMValue, newValue: GMValue) => void>>()
let listenerSeq = 0

function getStore(): Record<string, GMValue> {
  if (!window.__VWS_GM_STORE__) {
    window.__VWS_GM_STORE__ = {}
  }
  return window.__VWS_GM_STORE__
}

function sendRequest<T>(method: string, args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    window.dispatchEvent(
      new CustomEvent(REQUEST_EVENT, {
        detail: { id, method, args },
      })
    )
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`GM bridge timeout: ${method}`))
      }
    }, 30000)
  })
}

window.addEventListener(RESPONSE_EVENT, ((event: CustomEvent<{ id: number; result?: unknown; error?: string }>) => {
  const { id, result, error } = event.detail
  const entry = pending.get(id)
  if (!entry) return
  pending.delete(id)
  if (error) {
    entry.reject(new Error(error))
  } else {
    entry.resolve(result)
  }
}) as EventListener)

window.addEventListener('vws-gm-storage-changed', ((event: CustomEvent<{ key: string; oldValue: GMValue; newValue: GMValue }>) => {
  const { key, oldValue, newValue } = event.detail
  const store = getStore()
  if (newValue === undefined) {
    delete store[key]
  } else {
    store[key] = newValue
  }
  for (const listeners of changeListeners.values()) {
    for (const fn of listeners.values()) {
      try {
        fn(key, oldValue, newValue)
      } catch {
        // ignore listener errors
      }
    }
  }
}) as EventListener)

/**
 * Install GM_* on globalThis for preset / remote scripts.
 * @returns GMApi reference (same objects as on globalThis)
 */
export function installGmApiOnPage(): GMApi {
  const store = getStore()

  const api: GMApi = {
    GM_getValue<T = GMValue>(key: string, defaultValue?: T): T {
      return (key in store ? store[key] : defaultValue) as T
    },
    GM_setValue(key: string, value: GMValue): void {
      const oldValue = store[key]
      store[key] = value
      void sendRequest('setValue', [key, value]).catch((e) => {
        gmLogger.error('setValue failed:', e)
      })
      for (const listeners of changeListeners.values()) {
        for (const fn of listeners.values()) {
          try {
            fn(key, oldValue, value)
          } catch {
            // ignore
          }
        }
      }
    },
    GM_deleteValue(key: string): void {
      const oldValue = store[key]
      delete store[key]
      void sendRequest('deleteValue', [key]).catch((e) => {
        gmLogger.error('deleteValue failed:', e)
      })
      for (const listeners of changeListeners.values()) {
        for (const fn of listeners.values()) {
          try {
            fn(key, oldValue, undefined)
          } catch {
            // ignore
          }
        }
      }
    },
    GM_listValues(): string[] {
      return Object.keys(store)
    },
    GM_addValueChangeListener(name: string, listener: (n: string, o: GMValue, v: GMValue) => void): string {
      const id = `l${++listenerSeq}`
      if (!changeListeners.has(name)) {
        changeListeners.set(name, new Map())
      }
      changeListeners.get(name)!.set(id, listener)
      return id
    },
    GM_removeValueChangeListener(listenerId: string): void {
      for (const listeners of changeListeners.values()) {
        listeners.delete(listenerId)
      }
    },
    GM_xmlhttpRequest(details: GMRequestDetails): void {
      const { onload, onerror, onprogress, ...xhrPayload } = details
      void onprogress
      void sendRequest<{ status: number; responseText: string; responseHeaders?: string }>('xhr', [xhrPayload])
        .then((res) => {
          onload?.({
            status: res.status,
            statusText: '',
            responseText: res.responseText,
            responseHeaders: res.responseHeaders,
            finalUrl: details.url,
          })
        })
        .catch((err) => {
          onerror?.(err)
        })
    },
    GM_registerMenuCommand(caption: string, onClick: () => void): string {
      gmLogger.info('Menu command registered:', caption, '(use extension popup / options; onClick stored on window)')
      const id = `menu-${++listenerSeq}`
      const menus = ((window as unknown as { __VWS_MENU_COMMANDS__?: Map<string, () => void> }).__VWS_MENU_COMMANDS__ ??= new Map())
      menus.set(id, onClick)
      return id
    },
    GM_info: {
      script: {
        name: 'MagickMonkey Chrome Extension',
        version: window.__VWS_PAGE_CONFIG__?.extensionVersion ?? '0.0.0',
        description: 'Chrome shell for MagickMonkey preset',
      },
      scriptHandler: 'MagickMonkey',
    },
    unsafeWindow: window,
  }

  const g = globalThis as Record<string, unknown>
  for (const [key, value] of Object.entries(api)) {
    g[key] = value
  }

  return api
}
