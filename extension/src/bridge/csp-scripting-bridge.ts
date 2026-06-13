import { CSP_EXTENSION_EXECUTE_RESPONSE_TYPE } from '@shared/launcher-constants'

import { sendShellMessage, type ShellResponse } from '../shared/messages'
import { CSP_RELOAD_SCHEDULED_MESSAGE } from '../shell/csp-user-script-executor'
import { BRIDGE_MESSAGE_SOURCE } from './constants'

const inFlightCspExecute = new Set<number>()

function isCspReloadScheduledResponse(response: ShellResponse): boolean {
  return response.ok === true && 'message' in response && response.message === CSP_RELOAD_SCHEDULED_MESSAGE
}

function postCspExecuteResponse(requestId: number, ok: boolean, error?: string, cspReload = false): void {
  window.postMessage(
    {
      source: BRIDGE_MESSAGE_SOURCE,
      type: CSP_EXTENSION_EXECUTE_RESPONSE_TYPE,
      payload: ok ? { id: requestId, ok: true, ...(cspReload ? { cspReload: true } : {}) } : { id: requestId, ok: false, error: error ?? 'CSP main-world execute failed' },
    },
    '*'
  )
}

/** Forward page-world CSP execute request to background (MAIN world via userScripts API). */
export async function handleCspExtensionExecuteRequest(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') {
    return
  }
  const request = payload as {
    requestId?: unknown
    mode?: unknown
    decls?: unknown
    presetCode?: unknown
    withBody?: unknown
  }
  if (typeof request.requestId !== 'number') {
    return
  }

  if (inFlightCspExecute.has(request.requestId)) {
    return
  }
  inFlightCspExecute.add(request.requestId)

  try {
    if (request.mode === 'preset') {
      if (typeof request.decls !== 'string' || typeof request.presetCode !== 'string') {
        postCspExecuteResponse(request.requestId, false, 'Invalid CSP preset execute payload')
        return
      }
      const response = await sendShellMessage({
        type: 'EXECUTE_USER_SCRIPT',
        details: { mode: 'preset', decls: request.decls, presetCode: request.presetCode },
      })
      if (!response.ok) {
        postCspExecuteResponse(request.requestId, false, response.error)
        return
      }
      postCspExecuteResponse(request.requestId, true, undefined, isCspReloadScheduledResponse(response))
      return
    }

    if (request.mode === 'global') {
      if (typeof request.withBody !== 'string') {
        postCspExecuteResponse(request.requestId, false, 'Invalid CSP global execute payload')
        return
      }
      const response = await sendShellMessage({
        type: 'EXECUTE_USER_SCRIPT',
        details: { mode: 'global', withBody: request.withBody },
      })
      if (!response.ok) {
        postCspExecuteResponse(request.requestId, false, response.error)
        return
      }
      postCspExecuteResponse(request.requestId, true, undefined, isCspReloadScheduledResponse(response))
      return
    }

    postCspExecuteResponse(request.requestId, false, 'Invalid CSP execute mode')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    postCspExecuteResponse(request.requestId, false, message)
  } finally {
    inFlightCspExecute.delete(request.requestId)
  }
}
