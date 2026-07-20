import type { ScriptPermissionContext, ScriptPermissionRequest } from '@shared/script-permission'

import type { GMRequestDetails } from '../page/gm-types'
import { createExtensionLogger, permissionLogger } from '../shared/logger'
import type { ShellResponse } from '../shared/messages'
import { BRIDGE_MESSAGE_SOURCE, GM_STORAGE_PREFIX, RESPONSE_EVENT, STORAGE_CHANGED_EVENT } from './constants'
import { isExtensionContextInvalidated } from './extension-context'

const screenshotLogger = createExtensionLogger('Screenshot')
const CAPTURE_MESSAGE_TIMEOUT_MS = 65_000

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

async function sendShellMessageWithTimeout(message: Record<string, unknown>, timeoutMs: number): Promise<ShellResponse> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return (await Promise.race([
      chrome.runtime.sendMessage(message),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Background message timeout after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])) as ShellResponse
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

export function postStorageChanged(key: string, oldValue: unknown, newValue: unknown): void {
  window.postMessage({ source: BRIDGE_MESSAGE_SOURCE, type: STORAGE_CHANGED_EVENT, payload: { key, oldValue, newValue } }, '*')
}

async function handleXhr(details: GMRequestDetails, permission?: ScriptPermissionRequest): Promise<{ status: number; responseText: string; responseHeaders?: string }> {
  const response = (await chrome.runtime.sendMessage({
    type: 'GM_XHR',
    details: {
      method: details.method,
      url: details.url,
      headers: details.headers,
      data: details.data,
      timeout: details.timeout,
      responseType: details.responseType,
      permission,
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
        const [details, permission] = args as [GMRequestDetails, ScriptPermissionRequest | undefined]
        const result = await handleXhr(details, permission)
        respond(id, result)
        return
      }
      if (method === 'captureScreenshot') {
        const [options, permission] = args as [{ format?: 'png' | 'jpeg'; quality?: number } | undefined, ScriptPermissionRequest | undefined]
        screenshotLogger.info('bridge:captureScreenshot:start', { id, messageType: 'CAPTURE_VISIBLE_TAB' })
        const response = await sendShellMessageWithTimeout(
          {
            type: 'CAPTURE_VISIBLE_TAB',
            options: options ?? {},
            permission,
          },
          CAPTURE_MESSAGE_TIMEOUT_MS
        )
        if (!response?.ok || !('dataUrl' in response) || typeof response.dataUrl !== 'string') {
          throw new Error(response?.ok === false ? response.error : 'CAPTURE_VISIBLE_TAB failed')
        }
        screenshotLogger.ok('bridge:captureScreenshot:success', { id, bytes: response.dataUrl.length })
        respond(id, response.dataUrl)
        return
      }
      if (method === 'permission') {
        const [request] = args as [ScriptPermissionRequest]
        permissionLogger.info('bridge:permission-received', {
          file: request.file,
          capability: request.capability,
          resource: request.resource,
          scriptKey: request.scriptKey,
        })
        const response = (await chrome.runtime.sendMessage({
          type: 'SCRIPT_PERMISSION_ENSURE',
          request,
        })) as { ok?: boolean; allowed?: boolean }
        const allowed = response?.ok === true && response.allowed === true
        permissionLogger.info('bridge:permission-forwarded', { file: request.file, allowed })
        respond(id, allowed)
        return
      }
      if (method === 'seedConnects') {
        const [context, connects] = args as [ScriptPermissionContext, string[]]
        await chrome.runtime.sendMessage({
          type: 'SCRIPT_PERMISSION_SEED_CONNECTS',
          context,
          connects,
        })
        respond(id, true)
        return
      }
      if (method === 'seedTrustTier1') {
        const [context] = args as [ScriptPermissionContext]
        const response = (await chrome.runtime.sendMessage({
          type: 'SCRIPT_PERMISSION_SEED_TRUST_TIER1',
          context,
        })) as { ok?: boolean; grantedKeys?: string[] }
        respond(id, response?.ok === true && Array.isArray(response.grantedKeys) ? response.grantedKeys : [])
        return
      }
      if (method === 'openSidePanel') {
        const response = (await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' })) as ShellResponse
        if (!response?.ok) {
          throw new Error(response?.ok === false ? response.error : 'OPEN_SIDE_PANEL failed')
        }
        respond(id, true)
        return
      }
      respond(id, undefined, `Unknown method: ${method}`)
    } catch (e) {
      respond(id, undefined, e instanceof Error ? e.message : String(e))
    }
  })()
}
