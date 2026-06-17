import type { ShellResponse } from '../shared/messages'
import { PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE } from '../shell/permission-manager'
import { BRIDGE_MESSAGE_SOURCE, PERMISSION_ALLOW_KEYS_CHANGED_EVENT } from './constants'
import { getRuntimeId, isExtensionContextInvalidated } from './extension-context'

/** Push latest background allow snapshot to the page world (replaces page cache). */
export async function postPermissionAllowKeysToPage(): Promise<void> {
  if (!getRuntimeId()) {
    return
  }
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'GET_PAGE_PERMISSION_ALLOW_KEYS' })) as ShellResponse
    if (!res.ok || !('permissionAllowKeys' in res) || !Array.isArray(res.permissionAllowKeys)) {
      return
    }
    window.postMessage(
      {
        source: BRIDGE_MESSAGE_SOURCE,
        type: PERMISSION_ALLOW_KEYS_CHANGED_EVENT,
        payload: { keys: res.permissionAllowKeys },
      },
      window.location.origin
    )
  } catch (error) {
    isExtensionContextInvalidated(error)
  }
}

let permissionAllowSyncInstalled = false

/** Refresh page-world allow cache when registry or session grants change in background. */
export function installPermissionAllowSyncListener(): void {
  if (permissionAllowSyncInstalled) {
    return
  }
  permissionAllowSyncInstalled = true

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE) {
      void postPermissionAllowKeysToPage()
    }
  })
}
