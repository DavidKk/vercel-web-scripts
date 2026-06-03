/**
 * Menu registration functions
 */

import { GME_debug, GME_fail } from '@/helpers/logger'
import { fetchAndCacheRules } from '@/rules'
import { EDITOR_DEV_EVENT_KEY, getActiveDevMode, getEditorDevHost, isEditorDevMode } from '@/services/dev-mode'
import { deleteLauncherBootstrapStorage } from '@/services/launcher-bootstrap-storage'
import { logStore } from '@/services/log-store'
import { openOptionalLogViewer } from '@/services/optional-ui'
import { getScriptUpdate } from '@/services/script-update'
import { isLogPersistEnabled, setLogPersistEnabled } from '@/services/shell-log-settings'
import { isShellNetworkEnabled, runWithShellNetworkAsync, setShellNetworkEnabled } from '@/services/shell-network-settings'
import { GME_notification } from '@/ui/notification/index'

/** Tampermonkey menu command id for shell network toggle (re-registered when state changes) */
let shellNetworkMenuCmdId: string | number | undefined
/** Menu command id for log IndexedDB persistence toggle */
let shellLogPersistMenuCmdId: string | number | undefined

/**
 * Register or refresh shell network menu label to match GM storage.
 */
/**
 * Register or refresh log persistence menu label to match GM storage.
 */
function registerShellLogPersistMenuItem(): void {
  if (shellLogPersistMenuCmdId !== undefined) {
    GM_unregisterMenuCommand(shellLogPersistMenuCmdId)
    shellLogPersistMenuCmdId = undefined
  }
  const enabled = isLogPersistEnabled()
  const label = `Log persist (IndexedDB): ${enabled ? 'On' : 'Off'}`
  shellLogPersistMenuCmdId = GM_registerMenuCommand(label, () => {
    const next = !isLogPersistEnabled()
    setLogPersistEnabled(next)
    logStore.setPersistenceEnabled(next)
    GME_debug(`[Log persist] toggle enabled=${next}`)
    GME_notification(next ? 'Logs will persist across sessions (IndexedDB)' : 'Logs are memory-only for this tab (IndexedDB cleared)', next ? 'success' : 'info', 3500)
    registerShellLogPersistMenuItem()
  })
}

function registerShellNetworkMenuItem(): void {
  if (shellNetworkMenuCmdId !== undefined) {
    GM_unregisterMenuCommand(shellNetworkMenuCmdId)
    shellNetworkMenuCmdId = undefined
  }
  const enabled = isShellNetworkEnabled()
  const label = `Shell network: ${enabled ? 'On' : 'Off'}`
  shellNetworkMenuCmdId = GM_registerMenuCommand(label, () => {
    const previous = isShellNetworkEnabled()
    const next = !previous
    setShellNetworkEnabled(next)
    GME_debug(`[Shell network] toggle previous=${previous} requested=${next} persisted=${isShellNetworkEnabled()}`)
    GME_notification(
      next ? 'Shell network on (preset/rules/remote can load from server)' : 'Shell network off (cached preset & remote only; GIST scripts may still request)',
      next ? 'success' : 'info',
      3000
    )
    registerShellNetworkMenuItem()
  })
}

/**
 * Register basic menu commands
 */
export function registerBasicMenus(): void {
  GM_registerMenuCommand('Edit Script', () => {
    window.open(__EDITOR_URL__, '_blank')
  })

  /**
   * Handle update script menu - validate and execute remote script in place (no new tab).
   * Uses script-update service: this tab becomes HOST, validates, fetches and executes script.
   */
  GM_registerMenuCommand('Update Script', async () => {
    try {
      GME_debug('[Update Script] Starting in-place update...')
      await runWithShellNetworkAsync(async () => {
        deleteLauncherBootstrapStorage()
        await getScriptUpdate().update(__SCRIPT_URL__)
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail('[Update Script] Update failed: ' + errorMessage)
      GME_notification('Script update failed: ' + errorMessage, 'error', 5000)
    }
  })

  registerShellNetworkMenuItem()
  registerShellLogPersistMenuItem()

  GM_registerMenuCommand('Update Rules', async () => {
    await runWithShellNetworkAsync(async () => {
      await fetchAndCacheRules()
    })
    GME_notification('Rules updated successfully', 'success')
  })

  GM_registerMenuCommand('View Logs', () => {
    void openOptionalLogViewer()
  })

  /**
   * Register "Stop Dev Mode" menu only when editor dev mode is active (using cached value)
   */
  const activeDevMode = getActiveDevMode()

  if (activeDevMode === 'editor') {
    GM_registerMenuCommand('Stop Editor Dev Mode', () => {
      const isEditorDevModeActive = isEditorDevMode()
      if (!isEditorDevModeActive) {
        GME_notification('Editor dev mode is not active.', 'info')
        return
      }

      const host = getEditorDevHost()
      if (host) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_notification('Editor dev mode stopped. All tabs will return to normal mode.', 'success')
        GME_debug('Editor dev mode manually stopped by user, host: ' + host)
      } else {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_notification('Editor dev mode cleared.', 'success')
        GME_debug('Editor dev mode manually cleared by user')
      }
    })
  }
}
