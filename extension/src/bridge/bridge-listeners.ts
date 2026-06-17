import {
  CSP_EXTENSION_EXECUTE_EVENT,
  CSP_EXTENSION_EXECUTE_RESPONSE_TYPE,
  DEBUG_LOG_BOOT_FLUSH_MESSAGE_TYPE,
  DEBUG_LOG_MESSAGE_TYPE,
  SCRIPT_FAILED_MESSAGE_TYPE,
} from '@shared/launcher-constants'

import { permissionLogger } from '../shared/logger'
import { isValidBridgeToken } from './bridge-token'
import { BRIDGE_MESSAGE_SOURCE, REQUEST_EVENT } from './constants'
import { handleCspExtensionExecuteRequest } from './csp-scripting-bridge'
import { handleDebugLogMessage } from './debug-log-relay'
import { handleBridgeRequest } from './gm-storage-bridge'
import { handleScriptLifecycleMessage } from './script-trigger-reporter'
import { handleWebInstallMessage, isWebInstallMessage } from './web-install-bridge'

function handlePageBridgeMessage(event: MessageEvent): void {
  if (event.source !== window || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') {
    return
  }
  const data = event.data as { source?: unknown; type?: unknown; payload?: unknown }

  if (isWebInstallMessage(data)) {
    void handleWebInstallMessage(event, data).catch(() => undefined)
    return
  }

  if (data.source !== BRIDGE_MESSAGE_SOURCE) {
    return
  }

  if (typeof data.type === 'string') {
    if (data.type === DEBUG_LOG_MESSAGE_TYPE || data.type === DEBUG_LOG_BOOT_FLUSH_MESSAGE_TYPE) {
      handleDebugLogMessage(data.type, data.payload)
      return
    }
    handleScriptLifecycleMessage(data.type, data.payload)
    if (data.type !== REQUEST_EVENT) {
      return
    }
  }

  if (data.type === REQUEST_EVENT) {
    const bridgeToken = (data as { bridgeToken?: unknown }).bridgeToken
    if (!isValidBridgeToken(bridgeToken)) {
      const payload = data.payload as { method?: unknown } | undefined
      if (payload?.method === 'permission' || payload?.method === 'seedConnects' || payload?.method === 'seedTrustTier1') {
        permissionLogger.warn('bridge:token-rejected', {
          method: payload.method,
          hasToken: typeof bridgeToken === 'string' && bridgeToken.length > 0,
        })
      }
      return
    }
    handleBridgeRequest(data.payload)
  }
}

let bridgeListenersInstalled = false

/** Wire GM custom event + window.postMessage handlers once per content script instance. */
export function installBridgeListeners(): void {
  if (bridgeListenersInstalled) {
    return
  }
  bridgeListenersInstalled = true

  window.addEventListener(REQUEST_EVENT, ((event: CustomEvent<{ id: number; method: string; args: unknown[]; bridgeToken?: string }>) => {
    if (!isValidBridgeToken(event.detail?.bridgeToken)) {
      return
    }
    handleBridgeRequest(event.detail)
  }) as EventListener)

  window.addEventListener(CSP_EXTENSION_EXECUTE_EVENT, ((event: CustomEvent<unknown>) => {
    void handleCspExtensionExecuteRequest(event.detail).catch((error) => {
      const requestId =
        event.detail && typeof event.detail === 'object' && typeof (event.detail as { requestId?: unknown }).requestId === 'number'
          ? (event.detail as { requestId: number }).requestId
          : null
      if (requestId != null) {
        window.postMessage(
          {
            source: BRIDGE_MESSAGE_SOURCE,
            type: CSP_EXTENSION_EXECUTE_RESPONSE_TYPE,
            payload: {
              id: requestId,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
          },
          '*'
        )
      }
    })
  }) as EventListener)

  window.addEventListener(SCRIPT_FAILED_MESSAGE_TYPE, ((event: CustomEvent<unknown>) => {
    handleScriptLifecycleMessage(SCRIPT_FAILED_MESSAGE_TYPE, event.detail)
  }) as EventListener)

  window.addEventListener('message', handlePageBridgeMessage)
}
