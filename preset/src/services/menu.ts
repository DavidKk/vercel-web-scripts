/**
 * Menu registration functions
 */

import { PRESET_CACHE_KEY } from '@/constants'
import { GME_debug, GME_fail } from '@/helpers/logger'
import { fetchAndCacheRules } from '@/rules'
import { EDITOR_DEV_EVENT_KEY, getActiveDevMode, getEditorDevHost, isEditorDevMode } from '@/services/dev-mode'
import { getScriptUpdate } from '@/services/script-update'
import { GME_openLogViewer } from '@/ui/log-viewer/index'
import { GME_notification } from '@/ui/notification/index'

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
      GM_deleteValue(PRESET_CACHE_KEY)
      await getScriptUpdate().update(__SCRIPT_URL__)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail('[Update Script] Update failed: ' + errorMessage)
      GME_notification('Script update failed: ' + errorMessage, 'error', 5000)
    }
  })

  GM_registerMenuCommand('Update Rules', async () => {
    await fetchAndCacheRules()
    GME_notification('Rules updated successfully', 'success')
  })

  GM_registerMenuCommand('View Logs', () => {
    GME_openLogViewer()
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
