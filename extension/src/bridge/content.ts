/**
 * Isolated content script: storage/XHR bridge + inject page-world launcher.
 */

import { EXTENSION_BRIDGE_MESSAGE_SOURCE, SCRIPT_FAILED_MESSAGE_TYPE, SCRIPT_TRIGGERED_MESSAGE_TYPE } from '@shared/launcher-constants'

import type { GMRequestDetails } from '../page/gm-types'
import { buildPageBootstrapConfig, ensureExtensionServicesState } from '../shared/extension-storage'
import type { ShellResponse } from '../shared/messages'
import type { PageBootstrapConfig } from '../types'

const REQUEST_EVENT = 'vws-gm-request'
const RESPONSE_EVENT = 'vws-gm-response'
const STORAGE_CHANGED_EVENT = 'vws-gm-storage-changed'
const BRIDGE_MESSAGE_SOURCE = EXTENSION_BRIDGE_MESSAGE_SOURCE
const WEB_MESSAGE_SOURCE = 'magickmonkey-web'
const WEB_RESPONSE_SOURCE = 'magickmonkey-extension'
const GM_STORAGE_PREFIX = 'vws_gm_'
const BOOTSTRAP_DATA_PREFIX = 'vws-bootstrap-data-'
const LAUNCHER_SCRIPT_PREFIX = 'vws-page-launcher-'

/** Set after first invalidated chrome.* call — old content script survives extension reload until tab refresh. */
let extensionContextDead = false

type WebInstallMessage =
  | {
      source: typeof WEB_MESSAGE_SOURCE
      type: 'MAGICKMONKEY_EXTENSION_PING'
      requestId?: string
      payload?: { baseUrl?: string; scriptKey?: string }
    }
  | {
      source: typeof WEB_MESSAGE_SOURCE
      type: 'MAGICKMONKEY_CONNECT_EXTENSION'
      requestId?: string
      payload?: { baseUrl?: string; scriptKey?: string; developMode?: boolean }
    }

function storageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
}

function markExtensionContextDead(): void {
  extensionContextDead = true
}

function isExtensionContextInvalidated(error: unknown): boolean {
  if (error instanceof Error && error.message.includes('Extension context invalidated')) {
    markExtensionContextDead()
    return true
  }
  return false
}

function getRuntimeId(): string | null {
  if (extensionContextDead) {
    return null
  }
  try {
    const id = chrome.runtime?.id ?? null
    if (!id) {
      return null
    }
    // `runtime.id` alone can still be truthy after reload; getManifest confirms the context.
    chrome.runtime.getManifest()
    return id
  } catch {
    markExtensionContextDead()
    return null
  }
}

function getExtensionVersion(): string {
  if (extensionContextDead) {
    return '0.0.0'
  }
  try {
    return chrome.runtime.getManifest().version ?? '0.0.0'
  } catch {
    markExtensionContextDead()
    return '0.0.0'
  }
}

function getExtensionResourceUrl(path: string): string | null {
  try {
    if (!getRuntimeId()) {
      return null
    }
    return chrome.runtime.getURL(path)
  } catch {
    return null
  }
}

async function isServiceConnected(baseUrl: string, scriptKey: string): Promise<boolean> {
  const state = await ensureExtensionServicesState()
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '')
  const normalizedKey = scriptKey.trim()
  return state.services.some((service) => service.enabled !== false && service.baseUrl.trim().replace(/\/+$/, '') === normalizedBase && service.scriptKey.trim() === normalizedKey)
}

async function loadGmStore(): Promise<Record<string, unknown>> {
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
  const launcherUrl = getExtensionResourceUrl('page-launcher.js')
  if (!launcherUrl) {
    return
  }
  script.src = launcherUrl
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

function isScriptTriggeredDetail(value: unknown): value is { file: string; runAt: string; scriptKey?: string } {
  return !!value && typeof value === 'object' && typeof (value as { file?: unknown }).file === 'string' && typeof (value as { runAt?: unknown }).runAt === 'string'
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function isSameOriginBaseUrl(baseUrl: string, origin: string): boolean {
  try {
    return new URL(baseUrl).origin === origin
  } catch {
    return false
  }
}

function postWebResponse(event: MessageEvent, type: string, requestId: string | undefined, payload: Record<string, unknown>): void {
  window.postMessage({ source: WEB_RESPONSE_SOURCE, type, requestId, payload }, event.origin)
}

function postWebInstallFailure(event: MessageEvent, data: WebInstallMessage, payload: { ok: false; installed: boolean; error: string; extensionVersion: string }): void {
  const type = data.type === 'MAGICKMONKEY_EXTENSION_PING' ? 'MAGICKMONKEY_EXTENSION_PONG' : 'MAGICKMONKEY_CONNECT_EXTENSION_RESULT'
  postWebResponse(event, type, data.requestId, payload)
}

async function handleWebInstallMessage(event: MessageEvent, data: WebInstallMessage): Promise<void> {
  const extensionVersion = getExtensionVersion()
  const reloadedPayload = {
    ok: false as const,
    installed: false,
    error: 'Extension was reloaded — refresh this page and try again.',
    extensionVersion,
  }

  try {
    const payload = data.payload ?? {}
    const baseUrl = typeof payload.baseUrl === 'string' ? normalizeBaseUrl(payload.baseUrl) : event.origin
    const scriptKey = typeof payload.scriptKey === 'string' ? payload.scriptKey.trim() : ''

    if (!getRuntimeId()) {
      postWebInstallFailure(event, data, reloadedPayload)
      return
    }

    if (!isSameOriginBaseUrl(baseUrl, event.origin)) {
      postWebInstallFailure(event, data, {
        ok: false,
        installed: true,
        error: 'Server URL must match current page origin.',
        extensionVersion,
      })
      return
    }

    if (data.type === 'MAGICKMONKEY_EXTENSION_PING') {
      const connected = scriptKey ? await isServiceConnected(baseUrl, scriptKey) : false
      postWebResponse(event, 'MAGICKMONKEY_EXTENSION_PONG', data.requestId, {
        ok: true,
        installed: true,
        connected,
        extensionVersion,
      })
      return
    }

    if (!scriptKey) {
      postWebResponse(event, 'MAGICKMONKEY_CONNECT_EXTENSION_RESULT', data.requestId, {
        ok: false,
        installed: true,
        error: 'Missing Script Key.',
        extensionVersion,
      })
      return
    }

    const response = (await chrome.runtime.sendMessage({
      type: 'WEB_CONNECT_EXTENSION',
      details: {
        baseUrl,
        scriptKey,
        developMode: 'developMode' in payload ? payload.developMode !== false : true,
      },
    })) as ShellResponse
    postWebResponse(event, 'MAGICKMONKEY_CONNECT_EXTENSION_RESULT', data.requestId, {
      ok: response?.ok === true,
      installed: true,
      connected: response?.ok === true,
      error: response?.ok === false ? response.error : undefined,
      extensionVersion,
    })
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      postWebInstallFailure(event, data, reloadedPayload)
      return
    }
    postWebInstallFailure(event, data, {
      ok: false,
      installed: true,
      error: error instanceof Error ? error.message : String(error),
      extensionVersion,
    })
  }
}

const scriptTriggerDedupe = new Set<string>()
let scriptTriggerPageUrl = ''

function reportScriptFailed(file: string, runAt: string): void {
  if (!getRuntimeId()) {
    return
  }
  void chrome.runtime
    .sendMessage({
      type: 'SCRIPT_FAILED',
      details: {
        file,
        runAt,
        url: window.location.href,
      },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

function reportScriptTriggered(file: string, runAt: string, scriptKey?: string): void {
  const href = window.location.href
  if (href !== scriptTriggerPageUrl) {
    scriptTriggerPageUrl = href
    scriptTriggerDedupe.clear()
  }
  const dedupeKey = `${scriptKey ?? ''}|${file}|${runAt}`
  if (scriptTriggerDedupe.has(dedupeKey)) {
    return
  }
  scriptTriggerDedupe.add(dedupeKey)

  if (!getRuntimeId()) {
    return
  }
  void chrome.runtime
    .sendMessage({
      type: 'SCRIPT_TRIGGERED',
      details: {
        file,
        runAt,
        url: window.location.href,
        scriptKey,
      },
    })
    .catch((error) => {
      isExtensionContextInvalidated(error)
    })
}

function handlePageBridgeMessage(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
    return
  }
  const data = event.data as WebInstallMessage | { source?: unknown; type?: unknown; payload?: unknown }
  const { source, type, payload } = data

  if (source === WEB_MESSAGE_SOURCE && (type === 'MAGICKMONKEY_EXTENSION_PING' || type === 'MAGICKMONKEY_CONNECT_EXTENSION')) {
    void handleWebInstallMessage(event, data as WebInstallMessage).catch(() => undefined)
    return
  }

  if (source !== BRIDGE_MESSAGE_SOURCE) {
    return
  }

  if (type === SCRIPT_TRIGGERED_MESSAGE_TYPE) {
    if (isScriptTriggeredDetail(payload)) {
      reportScriptTriggered(payload.file, payload.runAt, payload.scriptKey)
    }
    return
  }

  if (type === SCRIPT_FAILED_MESSAGE_TYPE) {
    if (isScriptTriggeredDetail(payload)) {
      reportScriptFailed(payload.file, payload.runAt)
    }
    return
  }

  if (type === REQUEST_EVENT) {
    handleBridgeRequest(payload)
  }
}

let bridgeListenersInstalled = false

function installBridgeListeners(): void {
  if (bridgeListenersInstalled) {
    return
  }
  bridgeListenersInstalled = true

  window.addEventListener(REQUEST_EVENT, ((event: CustomEvent<{ id: number; method: string; args: unknown[] }>) => {
    handleBridgeRequest(event.detail)
  }) as EventListener)

  window.addEventListener('message', handlePageBridgeMessage)
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

  let bootstrapConfig: PageBootstrapConfig | null
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
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return
      for (const [fullKey, change] of Object.entries(changes)) {
        if (!fullKey.startsWith(GM_STORAGE_PREFIX)) continue
        const key = fullKey.slice(GM_STORAGE_PREFIX.length)
        postStorageChanged(key, change.oldValue, change.newValue)
      }
    })
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      return
    }
    throw error
  }

  await waitForDocumentBody()
  injectPageScript(bootstrapConfig, gmStore)
}

function notifyTabPageLoad(): void {
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

installBridgeListeners()
notifyTabPageLoad()
void bootstrap().catch(() => undefined)
