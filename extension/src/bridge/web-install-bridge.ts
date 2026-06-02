import { ensureExtensionServicesState } from '../shared/extension-storage'
import type { ShellResponse } from '../shared/messages'
import { WEB_MESSAGE_SOURCE, WEB_RESPONSE_SOURCE } from './constants'
import { getExtensionVersion, getRuntimeId, isExtensionContextInvalidated } from './extension-context'

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

async function isServiceConnected(baseUrl: string, scriptKey: string): Promise<boolean> {
  const state = await ensureExtensionServicesState()
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '')
  const normalizedKey = scriptKey.trim()
  return state.services.some((service) => service.enabled !== false && service.baseUrl.trim().replace(/\/+$/, '') === normalizedBase && service.scriptKey.trim() === normalizedKey)
}

function postWebResponse(event: MessageEvent, type: string, requestId: string | undefined, payload: Record<string, unknown>): void {
  window.postMessage({ source: WEB_RESPONSE_SOURCE, type, requestId, payload }, event.origin)
}

function postWebInstallFailure(event: MessageEvent, data: WebInstallMessage, payload: { ok: false; installed: boolean; error: string; extensionVersion: string }): void {
  const type = data.type === 'MAGICKMONKEY_EXTENSION_PING' ? 'MAGICKMONKEY_EXTENSION_PONG' : 'MAGICKMONKEY_CONNECT_EXTENSION_RESULT'
  postWebResponse(event, type, data.requestId, payload)
}

export function isWebInstallMessage(data: unknown): data is WebInstallMessage {
  if (!data || typeof data !== 'object') {
    return false
  }
  const message = data as { source?: unknown; type?: unknown }
  return message.source === WEB_MESSAGE_SOURCE && (message.type === 'MAGICKMONKEY_EXTENSION_PING' || message.type === 'MAGICKMONKEY_CONNECT_EXTENSION')
}

export async function handleWebInstallMessage(event: MessageEvent, data: WebInstallMessage): Promise<void> {
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
