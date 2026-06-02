/**
 * Dev-only: listen to Vite watch SSE and reload the unpacked extension (chrome.runtime.reload).
 * Compiled out of production when __EXTENSION_DEV_RELOAD_SSE__ is empty.
 */

declare const __EXTENSION_DEV_RELOAD_SSE__: string

import { loadExtensionConfig } from '@ext/shared/extension-storage'
import { CONFIG_STORAGE_KEY, SERVICES_STORAGE_KEY } from '@ext/types'

let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let eventSource: EventSource | undefined

function scheduleReconnect(url: string): void {
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    void connectDevReloadSse(url)
  }, 2000)
}

async function connectDevReloadSse(url: string): Promise<void> {
  eventSource?.close()
  eventSource = new EventSource(url)

  eventSource.addEventListener('reload', () => {
    chrome.runtime.reload()
  })

  eventSource.onerror = () => {
    eventSource?.close()
    eventSource = undefined
    scheduleReconnect(url)
  }
}

/**
 * Start SSE client when develop mode is on and watch build exposed a reload URL.
 */
function startDevReloadClient(url: string): void {
  void loadExtensionConfig().then((config) => {
    if (!config.developMode) {
      eventSource?.close()
      eventSource = undefined
      return
    }
    void connectDevReloadSse(url)
  })
}

export function initDevExtensionReload(): void {
  const url = typeof __EXTENSION_DEV_RELOAD_SSE__ !== 'undefined' ? __EXTENSION_DEV_RELOAD_SSE__ : ''
  if (!url) {
    return
  }

  startDevReloadClient(url)

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return
    }
    if (changes[SERVICES_STORAGE_KEY] || changes[CONFIG_STORAGE_KEY]) {
      startDevReloadClient(url)
    }
  })
}
