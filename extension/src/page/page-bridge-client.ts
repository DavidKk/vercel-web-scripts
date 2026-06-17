import { BRIDGE_MESSAGE_SOURCE, REQUEST_EVENT, RESPONSE_EVENT } from '@ext/bridge/constants'
import { permissionLogger } from '@ext/shared/logger'
import type { ScriptPermissionRequest } from '@shared/script-permission'

let bridgeToken = ''

/** Set once from bootstrap payload (content script → page launcher). */
export function setPageBridgeToken(token: string): void {
  bridgeToken = token.trim()
  if (bridgeToken) {
    permissionLogger.debug('bridge:token-set')
  }
}

let bridgeRequestId = 0
const bridgePending = new Map<
  number,
  {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    method: string
  }
>()

function isPermissionBridgeMethod(method: string): boolean {
  return method === 'permission' || method === 'seedConnects' || method === 'seedTrustTier1'
}

function summarizePermissionArgs(method: string, args: unknown[]): Record<string, unknown> {
  if (method === 'permission') {
    const request = args[0] as ScriptPermissionRequest | undefined
    if (!request) {
      return { request: null }
    }
    return {
      file: request.file,
      capability: request.capability,
      resource: request.resource,
      scriptKey: request.scriptKey,
    }
  }
  if (method === 'seedConnects') {
    const context = args[0] as ScriptPermissionRequest | undefined
    const connects = args[1]
    return {
      file: context?.file,
      scriptKey: context?.scriptKey,
      connectCount: Array.isArray(connects) ? connects.length : 0,
    }
  }
  return {}
}

function handleBridgeResponse(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return
  }
  const { id, result, error } = payload as { id?: unknown; result?: unknown; error?: unknown }
  if (typeof id !== 'number') {
    return
  }
  const entry = bridgePending.get(id)
  if (!entry) {
    return
  }
  bridgePending.delete(id)
  if (isPermissionBridgeMethod(entry.method)) {
    if (typeof error === 'string' && error) {
      permissionLogger.warn('bridge:response', { id, method: entry.method, error })
    } else {
      permissionLogger.info('bridge:response', { id, method: entry.method, allowed: result === true })
    }
  }
  if (typeof error === 'string' && error) {
    entry.reject(new Error(error))
    return
  }
  entry.resolve(result)
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
      return
    }
    const data = event.data as { source?: unknown; type?: unknown; payload?: unknown }
    if (data.source !== BRIDGE_MESSAGE_SOURCE || data.type !== RESPONSE_EVENT) {
      return
    }
    handleBridgeResponse(data.payload)
  })
}

/**
 * Send a GM bridge method request to the isolated content script.
 * @param method Bridge method name (`xhr`, `permission`, `setValue`, …)
 * @param args Method arguments
 */
export function sendPageBridgeRequest<T>(method: string, args: unknown[], timeoutMs = 30_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++bridgeRequestId
    bridgePending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      method,
    })
    if (isPermissionBridgeMethod(method)) {
      permissionLogger.info('bridge:send', {
        id,
        method,
        hasToken: Boolean(bridgeToken),
        ...summarizePermissionArgs(method, args),
      })
      if (!bridgeToken) {
        permissionLogger.warn('bridge:send-without-token', { id, method })
      }
    }
    window.postMessage(
      {
        source: BRIDGE_MESSAGE_SOURCE,
        type: REQUEST_EVENT,
        bridgeToken,
        payload: { id, method, args },
      },
      '*'
    )
    setTimeout(() => {
      if (!bridgePending.has(id)) {
        return
      }
      bridgePending.delete(id)
      if (isPermissionBridgeMethod(method)) {
        permissionLogger.warn('bridge:timeout', { id, method, timeoutMs })
      }
      reject(new Error(`Page bridge timeout: ${method}`))
    }, timeoutMs)
  })
}
