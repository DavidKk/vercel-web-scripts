import { BRIDGE_MESSAGE_SOURCE, PERMISSION_ALLOW_KEYS_CHANGED_EVENT } from '@ext/bridge/constants'

import { hydratePagePermissionAllowKeys } from './page-permission-allow-cache'

/** Listen for content-script pushes that replace the page-world allow snapshot. */
export function installPagePermissionAllowSyncListener(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return
    }
    const data = event.data
    if (!data || typeof data !== 'object') {
      return
    }
    const typed = data as { source?: unknown; type?: unknown; payload?: { keys?: unknown } }
    if (typed.source !== BRIDGE_MESSAGE_SOURCE || typed.type !== PERMISSION_ALLOW_KEYS_CHANGED_EVENT) {
      return
    }
    const keys = typed.payload?.keys
    if (!Array.isArray(keys)) {
      return
    }
    hydratePagePermissionAllowKeys(keys.filter((key): key is string => typeof key === 'string'))
  })
}
