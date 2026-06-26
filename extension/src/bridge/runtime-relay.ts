import type { RuntimeLoadFailedPayload, RuntimePresetReadyPayload } from '@ext/runtime/loader-types'

import { BRIDGE_MESSAGE_SOURCE, RUNTIME_LOAD_FAILED_MESSAGE_TYPE, RUNTIME_PRESET_READY_MESSAGE_TYPE } from './runtime-messages'

/**
 * Relay background runtime loader messages to the page world.
 */
export function relayRuntimeMessageToPage(type: typeof RUNTIME_PRESET_READY_MESSAGE_TYPE, payload: RuntimePresetReadyPayload): void
export function relayRuntimeMessageToPage(type: typeof RUNTIME_LOAD_FAILED_MESSAGE_TYPE, payload: RuntimeLoadFailedPayload): void
export function relayRuntimeMessageToPage(type: string, payload: RuntimePresetReadyPayload | RuntimeLoadFailedPayload): void {
  window.postMessage(
    {
      source: BRIDGE_MESSAGE_SOURCE,
      type,
      payload,
    },
    '*'
  )
}

let runtimeRelayInstalled = false

/** Listen for RUNTIME_* messages from background and forward to page. */
export function installRuntimeMessageRelay(): void {
  if (runtimeRelayInstalled) {
    return
  }
  runtimeRelayInstalled = true

  chrome.runtime.onMessage.addListener((message: { type?: string; payload?: unknown }) => {
    if (message?.type === RUNTIME_PRESET_READY_MESSAGE_TYPE && message.payload) {
      relayRuntimeMessageToPage(RUNTIME_PRESET_READY_MESSAGE_TYPE, message.payload as RuntimePresetReadyPayload)
      return
    }
    if (message?.type === RUNTIME_LOAD_FAILED_MESSAGE_TYPE && message.payload) {
      relayRuntimeMessageToPage(RUNTIME_LOAD_FAILED_MESSAGE_TYPE, message.payload as RuntimeLoadFailedPayload)
    }
  })
}
