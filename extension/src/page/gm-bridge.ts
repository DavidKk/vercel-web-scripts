/**
 * GM_* APIs on the page (MAIN world). Storage and XHR are delegated to the isolated content-script bridge.
 */

import { gmLogger } from '@ext/shared/logger'
import { LEGACY_AUTO_UPDATE_SCRIPT_KEY, SHELL_NETWORK_ENABLED_KEY } from '@shared/launcher-constants'

import type { GMApi, GMRequestDetails, GMResponse, GMValue } from './gm-types'

const REQUEST_EVENT = 'vws-gm-request'
const RESPONSE_EVENT = 'vws-gm-response'
const STORAGE_CHANGED_EVENT = 'vws-gm-storage-changed'
const BRIDGE_MESSAGE_SOURCE = 'vws-extension-bridge'
const XHR_CALLBACK_KEYS = new Set(['onabort', 'onerror', 'onload', 'onloadend', 'onloadstart', 'onprogress', 'onreadystatechange', 'ontimeout'])

let requestId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const changeListeners = new Map<string, Map<string, (name: string, oldValue: GMValue, newValue: GMValue) => void>>()
let listenerSeq = 0
let activeGmScope: string | null = null
const GM_GLOBAL_KEYS = new Set<string>([SHELL_NETWORK_ENABLED_KEY, LEGACY_AUTO_UPDATE_SCRIPT_KEY])

/**
 * Set GM namespace for the current launcher execution (`{gmScope}_{key}` in storage).
 * @param gmScope Scope prefix or null for legacy unscoped keys
 */
export function setActiveGmScope(gmScope: string | null): void {
  activeGmScope = gmScope?.trim() ? gmScope.trim() : null
}

function physicalGmKey(key: string): string {
  if (GM_GLOBAL_KEYS.has(key)) {
    return key
  }
  if (!activeGmScope) {
    return key
  }
  const prefix = `${activeGmScope}_`
  return key.startsWith(prefix) ? key : `${prefix}${key}`
}

function logicalGmKeys(): string[] {
  const store = getStore()
  if (!activeGmScope) {
    return Object.keys(store)
  }
  const prefix = `${activeGmScope}_`
  const keys = new Set<string>()
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) {
      keys.add(key.slice(prefix.length))
      continue
    }
    if (GM_GLOBAL_KEYS.has(key)) {
      keys.add(key)
    }
  }
  return [...keys]
}

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
    window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: REQUEST_EVENT, payload: { id, method, args } }, '*')
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`GM bridge timeout: ${method}`))
      }
    }, 30000)
  })
}

function handleBridgeResponse(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return
  }
  const { id, result, error } = payload as { id?: unknown; result?: unknown; error?: unknown }
  if (typeof id !== 'number') {
    return
  }
  const entry = pending.get(id)
  if (!entry) return
  pending.delete(id)
  if (typeof error === 'string' && error) {
    entry.reject(new Error(error))
  } else {
    entry.resolve(result)
  }
}

function handleStorageChanged(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return
  }
  const { key, oldValue, newValue } = payload as { key?: unknown; oldValue?: GMValue; newValue?: GMValue }
  if (typeof key !== 'string') {
    return
  }
  const store = getStore()
  const logicalKey = activeGmScope && key.startsWith(`${activeGmScope}_`) ? key.slice(activeGmScope.length + 1) : key
  if (newValue === undefined) {
    delete store[key]
  } else {
    store[key] = newValue
  }
  notifyValueChange(logicalKey, oldValue, newValue)
}

function notifyValueChange(key: string, oldValue: GMValue, newValue: GMValue): void {
  const listeners = changeListeners.get(key)
  if (!listeners) {
    return
  }
  for (const fn of listeners.values()) {
    try {
      fn(key, oldValue, newValue)
    } catch {
      // ignore listener errors
    }
  }
}

function sanitizeXhrDetails(details: GMRequestDetails): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    if (XHR_CALLBACK_KEYS.has(key) || typeof value === 'function') {
      continue
    }
    payload[key] = value
  }
  return payload
}

function buildXhrResponse(
  res: { status: number; statusText?: string; responseText: string; responseHeaders?: string; finalUrl?: string },
  responseType?: GMRequestDetails['responseType']
): GMResponse {
  let response: unknown = res.responseText
  if (responseType === 'json') {
    try {
      response = res.responseText ? JSON.parse(res.responseText) : null
    } catch {
      response = null
    }
  }
  return {
    finalUrl: res.finalUrl,
    readyState: 4,
    response,
    responseText: res.responseText,
    responseXML: null,
    status: res.status,
    statusText: res.statusText ?? '',
    responseHeaders: res.responseHeaders,
  }
}

window.addEventListener(RESPONSE_EVENT, ((event: CustomEvent<{ id: number; result?: unknown; error?: string }>) => {
  handleBridgeResponse(event.detail)
}) as EventListener)

window.addEventListener('vws-gm-storage-changed', ((event: CustomEvent<{ key: string; oldValue: GMValue; newValue: GMValue }>) => {
  handleStorageChanged(event.detail)
}) as EventListener)

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') {
    return
  }
  const { source, type, payload } = event.data as { source?: unknown; type?: unknown; payload?: unknown }
  if (source !== BRIDGE_MESSAGE_SOURCE) {
    return
  }
  if (type === RESPONSE_EVENT) {
    handleBridgeResponse(payload)
  } else if (type === STORAGE_CHANGED_EVENT) {
    handleStorageChanged(payload)
  }
})

/**
 * Install GM_* on globalThis for preset / remote scripts.
 * @returns GMApi reference (same objects as on globalThis)
 */
export function installGmApiOnPage(): GMApi {
  const store = getStore()
  const menuCommands = ((window as unknown as { __VWS_MENU_COMMANDS__?: Map<string, () => void> }).__VWS_MENU_COMMANDS__ ??= new Map())

  const api: GMApi = {
    GM_getValue<T = GMValue>(key: string, defaultValue?: T): T {
      const physical = physicalGmKey(key)
      if (physical in store) {
        return store[physical] as T
      }
      if (!activeGmScope && key in store) {
        return store[key] as T
      }
      return defaultValue as T
    },
    GM_setValue(key: string, value: GMValue): void {
      const physical = physicalGmKey(key)
      const oldValue = store[physical]
      store[physical] = value
      void sendRequest('setValue', [physical, value]).catch((e) => {
        gmLogger.error('setValue failed:', e)
      })
      notifyValueChange(key, oldValue, value)
    },
    GM_deleteValue(key: string): void {
      const physical = physicalGmKey(key)
      const oldValue = store[physical]
      delete store[physical]
      void sendRequest('deleteValue', [physical]).catch((e) => {
        gmLogger.error('deleteValue failed:', e)
      })
      notifyValueChange(key, oldValue, undefined)
    },
    GM_listValues(): string[] {
      return logicalGmKeys()
    },
    GM_setValues(values: Record<string, GMValue>): void {
      for (const [key, value] of Object.entries(values)) {
        api.GM_setValue(key, value)
      }
    },
    GM_getValues(keys: string[] | Record<string, GMValue>): Record<string, GMValue> {
      const result: Record<string, GMValue> = {}
      const entries = Array.isArray(keys) ? keys.map((key) => [key, undefined] as const) : Object.entries(keys)
      for (const [key, defaultValue] of entries) {
        result[key] = api.GM_getValue(key, defaultValue)
      }
      return result
    },
    GM_deleteValues(keys: string[]): void {
      for (const key of keys) {
        api.GM_deleteValue(key)
      }
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
      const { onload, onerror, onprogress, onreadystatechange, ontimeout, onabort } = details
      void onprogress
      const xhrPayload = sanitizeXhrDetails(details)
      void sendRequest<{ status: number; statusText?: string; responseText: string; responseHeaders?: string; finalUrl?: string }>('xhr', [xhrPayload])
        .then((res) => {
          const response = buildXhrResponse(res, details.responseType)
          onreadystatechange?.(response)
          onload?.(response)
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') {
            ontimeout?.(err)
            return
          }
          onabort?.(err)
          onerror?.(err)
        })
    },
    GM_registerMenuCommand(caption: string, onClick: () => void): string {
      gmLogger.debug('Menu registered:', caption)
      const id = `menu-${++listenerSeq}`
      menuCommands.set(id, onClick)
      return id
    },
    GM_unregisterMenuCommand(menuCmdId: string | number): void {
      menuCommands.delete(String(menuCmdId))
    },
    GM_addElement(tagName: string, attributes: Record<string, unknown> = {}): HTMLElement {
      const el = document.createElement(tagName)
      for (const [key, value] of Object.entries(attributes)) {
        if (key === 'textContent') {
          el.textContent = String(value ?? '')
        } else if (key in el) {
          ;(el as unknown as Record<string, unknown>)[key] = value
        } else if (value !== undefined && value !== null) {
          el.setAttribute(key, String(value))
        }
      }
      document.documentElement.appendChild(el)
      return el
    },
    GM_addStyle(css: string): HTMLStyleElement {
      const style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
      return style
    },
    GM_log(...messages: unknown[]): void {
      gmLogger.info(...messages)
    },
    GM_notification(details: string | { text?: string; title?: string; timeout?: number; onclick?: () => void }, ondone?: () => void): void {
      const text = typeof details === 'string' ? details : details.text || details.title || ''
      gmLogger.info('Notification:', text)
      if (ondone) {
        const timeout = typeof details === 'string' ? 0 : details.timeout || 0
        setTimeout(ondone, timeout)
      }
    },
    GM_openInTab(url: string): Window | null {
      return window.open(url, '_blank', 'noopener,noreferrer')
    },
    GM_setClipboard(data: string, _info?: unknown, cb?: () => void): void {
      const write = navigator.clipboard?.writeText(data) ?? Promise.resolve()
      void write
        .catch((e) => {
          gmLogger.error('setClipboard failed:', e)
        })
        .finally(() => {
          cb?.()
        })
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
