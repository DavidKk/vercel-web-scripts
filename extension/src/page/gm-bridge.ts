/**
 * GM_* APIs on the page (MAIN world). Storage and XHR are delegated to the isolated content-script bridge.
 */

import { gmLogger, permissionLogger } from '@ext/shared/logger'
import { setCachedShellLogOutputMode } from '@ext/shared/shell-log-output-cache'
import { appendAdoptedStyles } from '@shared/adopted-page-styles'
import { LEGACY_AUTO_UPDATE_SCRIPT_KEY, SHELL_LOG_PERSIST_ENABLED_KEY, SHELL_NETWORK_ENABLED_KEY } from '@shared/launcher-constants'
import type { ScriptPermissionRequest } from '@shared/script-permission'
import { normalizePermissionNetworkHost } from '@shared/script-permission'
import { normalizeShellLogOutputMode, SHELL_LOG_OUTPUT_MODE_KEY } from '@shared/shell-log-output'
import { readBoundProxyTargetProperty } from '@shared/with-global-sandbox'

import type { GMApi, GMRequestDetails, GMResponse, GMValue } from './gm-types'
import { sendPageBridgeRequest, setPageBridgeToken } from './page-bridge-client'
import { isPagePermissionAllowed, rememberPagePermissionAllow } from './page-permission-allow-cache'
import { ensureScriptPermission, getActiveScriptPermissionContext, isScriptPermissionEnforced, ScriptPermissionDeniedError } from './script-permission-scope'

const STORAGE_CHANGED_EVENT = 'vws-gm-storage-changed'
const BRIDGE_MESSAGE_SOURCE = 'vws-extension-bridge'
const XHR_CALLBACK_KEYS = new Set(['onabort', 'onerror', 'onload', 'onloadend', 'onloadstart', 'onprogress', 'onreadystatechange', 'ontimeout'])

const changeListeners = new Map<string, Map<string, (name: string, oldValue: GMValue, newValue: GMValue) => void>>()
let listenerSeq = 0
let activeGmScope: string | null = null
const GM_GLOBAL_KEYS = new Set<string>([SHELL_NETWORK_ENABLED_KEY, SHELL_LOG_PERSIST_ENABLED_KEY, SHELL_LOG_OUTPUT_MODE_KEY, LEGACY_AUTO_UPDATE_SCRIPT_KEY])

/**
 * Set GM namespace for the current launcher execution (`{gmScope}_{key}` in storage).
 * @param gmScope Scope prefix or null for legacy unscoped keys
 */
export function setActiveGmScope(gmScope: string | null): void {
  activeGmScope = gmScope?.trim() ? gmScope.trim() : null
}

/** Set once from bootstrap payload (content script → page launcher). */
export function setGmBridgeToken(token: string): void {
  setPageBridgeToken(token)
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

function sendRequest<T>(method: string, args: unknown[], timeoutMs?: number): Promise<T> {
  return sendPageBridgeRequest<T>(method, args, timeoutMs)
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
  if (logicalKey === SHELL_LOG_OUTPUT_MODE_KEY) {
    setCachedShellLogOutputMode(normalizeShellLogOutputMode(newValue))
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

function buildXhrPermissionRequest(details: GMRequestDetails, context: ReturnType<typeof getActiveScriptPermissionContext>): ScriptPermissionRequest | undefined {
  if (!context) {
    return undefined
  }
  const networkResource = normalizePermissionNetworkHost(String(details.url ?? ''))
  if (!networkResource) {
    return undefined
  }
  return {
    ...context,
    capability: 'network',
    resource: networkResource,
  }
}

function buildCapturePermissionRequest(context: ReturnType<typeof getActiveScriptPermissionContext>): ScriptPermissionRequest | undefined {
  if (!context) {
    return undefined
  }
  const resource = normalizePermissionNetworkHost(location.href)
  if (!resource) {
    return undefined
  }
  return {
    ...context,
    capability: 'capture-screenshot',
    resource,
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) {
    throw new Error('Invalid capture data URL')
  }
  const header = dataUrl.slice(0, comma)
  const base64 = dataUrl.slice(comma + 1)
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

function createUnsafeWindowGate(): Window {
  type AccessState = 'idle' | 'pending' | 'granted' | 'denied'
  let state: AccessState = 'idle'

  const denyAccess = (): never => {
    throw new ScriptPermissionDeniedError('unsafe-window access denied')
  }

  const ensureAccess = (): void => {
    if (!isScriptPermissionEnforced()) {
      return
    }
    if (state === 'granted') {
      return
    }
    if (state === 'denied') {
      denyAccess()
    }
    if (state === 'pending') {
      throw new ScriptPermissionDeniedError('unsafe-window permission pending — retry after granting')
    }
    const request = (() => {
      const ctx = getActiveScriptPermissionContext()
      if (!ctx) {
        return null
      }
      return { ...ctx, capability: 'unsafe-window' as const, resource: '*' }
    })()
    if (!request) {
      throw new ScriptPermissionDeniedError('No active script permission context')
    }
    if (isPagePermissionAllowed(request)) {
      permissionLogger.debug('unsafeWindow:page-cached-allow', {
        file: request.file,
        capability: request.capability,
        resource: request.resource,
        scriptKey: request.scriptKey,
      })
      state = 'granted'
      return
    }
    state = 'pending'
    permissionLogger.info('unsafeWindow:request', {
      file: request.file,
      capability: request.capability,
      resource: request.resource,
      scriptKey: request.scriptKey,
    })
    void sendPageBridgeRequest<boolean>('permission', [request], 5 * 60 * 1000).then((allowed) => {
      state = allowed ? 'granted' : 'denied'
      if (allowed) {
        rememberPagePermissionAllow(request)
      }
      permissionLogger.info('unsafeWindow:result', { file: request.file, allowed })
      if (!allowed) {
        gmLogger.warn('unsafeWindow denied by user or policy')
      }
    })
    throw new ScriptPermissionDeniedError('unsafe-window permission required')
  }

  return new Proxy(window, {
    get(target, prop) {
      if (!isScriptPermissionEnforced() || state === 'granted') {
        return readBoundProxyTargetProperty(target, prop)
      }
      ensureAccess()
      return readBoundProxyTargetProperty(target, prop)
    },
    set(target, prop, value) {
      if (!isScriptPermissionEnforced() || state === 'granted') {
        return Reflect.set(target, prop, value, target)
      }
      ensureAccess()
      return Reflect.set(target, prop, value, target)
    },
  })
}

function isBlobLike(value: unknown): value is Blob {
  return typeof value === 'object' && value !== null && typeof (value as Blob).size === 'number' && typeof (value as Blob).slice === 'function'
}

function triggerBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.documentElement.appendChild(anchor)
  anchor.click()
  anchor.remove()
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
  if (type === STORAGE_CHANGED_EVENT) {
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
      const enforced = isScriptPermissionEnforced()
      const permissionContext = enforced ? getActiveScriptPermissionContext() : null
      const xhrPayload = sanitizeXhrDetails(details)
      const permissionRequest = enforced ? buildXhrPermissionRequest(details, permissionContext) : undefined
      void (async () => {
        try {
          if (enforced) {
            if (!permissionRequest) {
              throw new ScriptPermissionDeniedError('Invalid request URL for network permission')
            }
            await ensureScriptPermission('network', permissionRequest.resource, permissionContext)
          }
          const res = await sendRequest<{ status: number; statusText?: string; responseText: string; responseHeaders?: string; finalUrl?: string }>('xhr', [
            xhrPayload,
            permissionRequest,
          ])
          const response = buildXhrResponse(res, details.responseType)
          onreadystatechange?.(response)
          onload?.(response)
        } catch (err) {
          if (err instanceof ScriptPermissionDeniedError) {
            onerror?.(err)
            return
          }
          if (err instanceof Error && err.name === 'AbortError') {
            ontimeout?.(err)
            return
          }
          onabort?.(err)
          onerror?.(err)
        }
      })()
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
      const adopted = appendAdoptedStyles(document, css)
      if (adopted) {
        return document.createElement('style')
      }
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
      void (async () => {
        try {
          if (isScriptPermissionEnforced()) {
            const permissionContext = getActiveScriptPermissionContext()
            const tabResource = normalizePermissionNetworkHost(url)
            if (!tabResource) {
              throw new ScriptPermissionDeniedError('Invalid URL for open-tab permission')
            }
            await ensureScriptPermission('open-tab', tabResource, permissionContext)
          }
          window.open(url, '_blank', 'noopener,noreferrer')
        } catch (error) {
          gmLogger.warn('openInTab denied:', error)
        }
      })()
      return null
    },
    GM_setClipboard(data: string | Blob, _info?: unknown, cb?: () => void): void {
      void (async () => {
        try {
          if (isScriptPermissionEnforced()) {
            const permissionContext = getActiveScriptPermissionContext()
            await ensureScriptPermission('clipboard-write', '*', permissionContext)
          }
          if (isBlobLike(data)) {
            if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
              throw new Error('Image clipboard write is not supported in this browser')
            }
            const type = data.type || 'image/png'
            await navigator.clipboard.write([new ClipboardItem({ [type]: data })])
          } else {
            const write = navigator.clipboard?.writeText(data) ?? Promise.resolve()
            await write
          }
          cb?.()
        } catch (error) {
          gmLogger.error('setClipboard failed:', error)
        }
      })()
    },
    async GM_captureVisibleTab(options?: { format?: 'png' | 'jpeg'; quality?: number }): Promise<Blob> {
      const enforced = isScriptPermissionEnforced()
      const permissionContext = enforced ? getActiveScriptPermissionContext() : null
      const permissionRequest = enforced ? buildCapturePermissionRequest(permissionContext) : undefined
      if (enforced) {
        if (!permissionRequest) {
          throw new ScriptPermissionDeniedError('Invalid page URL for capture-screenshot permission')
        }
        await ensureScriptPermission('capture-screenshot', permissionRequest.resource, permissionContext)
      }
      const dataUrl = await sendRequest<string>('captureScreenshot', [options ?? {}, permissionRequest], 60_000)
      return dataUrlToBlob(dataUrl)
    },
    GM_download(
      details:
        | string
        | {
            url: string | Blob | File
            name?: string
            onerror?: (error: { error: string }) => void
            onload?: () => void
          },
      name?: string
    ): { abort: () => void } {
      const permissionContext = getActiveScriptPermissionContext()
      let aborted = false
      void (async () => {
        try {
          if (typeof details === 'string') {
            if (isScriptPermissionEnforced()) {
              const resource = normalizePermissionNetworkHost(details)
              if (!resource) {
                throw new ScriptPermissionDeniedError('Invalid URL for download permission')
              }
              await ensureScriptPermission('download', resource, permissionContext)
            }
            if (aborted) {
              return
            }
            triggerBrowserDownload(details, name ?? 'download')
            return
          }
          if (isBlobLike(details.url)) {
            if (isScriptPermissionEnforced()) {
              await ensureScriptPermission('download', '*', permissionContext)
            }
            if (aborted) {
              return
            }
            const blobUrl = URL.createObjectURL(details.url)
            triggerBrowserDownload(blobUrl, details.name ?? name ?? 'download')
            URL.revokeObjectURL(blobUrl)
            details.onload?.()
            return
          }
          if (isScriptPermissionEnforced()) {
            const resource = normalizePermissionNetworkHost(details.url)
            if (!resource) {
              throw new ScriptPermissionDeniedError('Invalid URL for download permission')
            }
            await ensureScriptPermission('download', resource, permissionContext)
          }
          if (aborted) {
            return
          }
          triggerBrowserDownload(details.url, details.name ?? name ?? 'download')
          details.onload?.()
        } catch (error) {
          if (typeof details !== 'string') {
            details.onerror?.({ error: error instanceof Error ? error.message : String(error) })
          } else {
            gmLogger.error('download failed:', error)
          }
        }
      })()
      return {
        abort: () => {
          aborted = true
        },
      }
    },
    GM_info: {
      script: {
        name: 'MagickMonkey Chrome Extension',
        version: window.__VWS_PAGE_CONFIG__?.extensionVersion ?? '0.0.0',
        description: 'Chrome shell for MagickMonkey preset',
      },
      scriptHandler: 'MagickMonkey',
      isIncognito: window.__VWS_PAGE_CONFIG__?.incognito === true,
    },
    unsafeWindow: createUnsafeWindowGate(),
  }

  const g = globalThis as Record<string, unknown>
  for (const [key, value] of Object.entries(api)) {
    g[key] = value
  }

  return api
}
