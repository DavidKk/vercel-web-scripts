/**
 * Menu registration functions
 */

import { GME_fetch } from '../helpers/http'
import { GME_fail, GME_info, GME_ok } from '../helpers/logger'
import { fetchAndCacheRules } from '../rules'
import { GME_openLogViewer } from '../ui/log-viewer/index'
import { GME_notification } from '../ui/notification/index'
import { EDITOR_DEV_EVENT_KEY, getActiveDevMode, getEditorDevHost, getLocalDevHost, isEditorDevMode, LOCAL_DEV_EVENT_KEY } from './dev-mode'

/**
 * Register basic menu commands
 * @param webScriptId Web script ID for local dev mode check
 */
export function registerBasicMenus(webScriptId: string): void {
  GM_registerMenuCommand('Edit Script', () => {
    window.open(__EDITOR_URL__, '_blank')
  })

  /**
   * Handle update script menu - check script validity and open update URL
   * Similar to editor update button: check script, then open new page for Tampermonkey to auto-update
   */
  GM_registerMenuCommand('Update Script', async () => {
    try {
      GME_info('[Update Script] Checking script validity...')

      // Extract key from script URL (e.g., /static/{key}/tampermonkey.js)
      const urlObj = new URL(__SCRIPT_URL__, window.location.origin)
      const pathParts = urlObj.pathname.split('/')
      const keyIndex = pathParts.indexOf('static')
      if (keyIndex === -1 || keyIndex + 1 >= pathParts.length) {
        GME_fail('[Update Script] Invalid script URL format')
        GME_notification('Invalid script URL format', 'error')
        return
      }

      const key = pathParts[keyIndex + 1]
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`
      const userUrl = `${baseUrl}/static/${key}/tampermonkey.user.js`
      const fallback = `${baseUrl}/static/${key}/tampermonkey.js`

      // Check if tampermonkey.user.js exists (HEAD request)
      let url: string | null = null
      try {
        const userResponse = await GME_fetch(userUrl, { method: 'HEAD' })
        if (userResponse.ok) {
          url = userUrl
          GME_ok('[Update Script] Script validation passed (tampermonkey.user.js found)')
        } else {
          // Check fallback tampermonkey.js
          const fallbackResponse = await GME_fetch(fallback, { method: 'HEAD' })
          if (fallbackResponse.ok) {
            url = fallback
            GME_ok('[Update Script] Script validation passed (tampermonkey.js found)')
          } else {
            // Both URLs failed - compilation may have failed
            GME_fail('[Update Script] Script validation failed: Both tampermonkey.user.js and tampermonkey.js are not available')
            GME_fail('[Update Script] This usually means script compilation failed. Please check for errors.')
            GME_notification('Script compilation failed. Please check for errors in the editor.', 'error', 5000)
            // Return early without opening any URL (consistent with script-update service behavior)
            return
          }
        }
      } catch (error: any) {
        // Network error - fallback to opening the default URL (same as editor behavior)
        const errorMessage = error instanceof Error ? error.message : String(error)
        GME_fail('[Update Script] Script validation failed: ' + errorMessage)
        GME_info('[Update Script] Opening fallback URL due to network error')
        url = fallback
      }

      // Only open URL if validation passed or network error occurred
      if (url) {
        GME_ok('[Update Script] Opening script update URL: ' + url)
        window.open(url, '_blank', 'noopener')
        GME_notification('Script update page opened. Tampermonkey will automatically update the script.', 'success', 3000)
      }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail('[Update Script] Update failed: ' + errorMessage)
      GME_notification('Script update failed: ' + errorMessage, 'error', 5000)
    }
  })

  GM_registerMenuCommand('View Logs', () => {
    GME_openLogViewer()
  })

  GM_registerMenuCommand('Rule manager', () => {
    const url = __RULE_MANAGER_URL__ + '?url=' + encodeURIComponent(window.location.href) + '&t=' + Date.now()
    url && window.open(url, '_blank')
  })

  GM_registerMenuCommand('Refresh Rules', async () => {
    await fetchAndCacheRules()
    GME_notification('Rules refreshed successfully', 'success')
  })

  /**
   * Register "Stop Dev Mode" menu only when dev mode is active (using cached script)
   * Check if either local dev mode or editor dev mode is active by checking cached values
   */
  const activeDevMode = getActiveDevMode()

  if (activeDevMode) {
    const menuText = activeDevMode === 'local' ? 'Stop Watching Local Files' : 'Stop Editor Dev Mode'

    GM_registerMenuCommand(menuText, () => {
      if (activeDevMode === 'editor') {
        const isEditorDevModeActive = isEditorDevMode()
        if (!isEditorDevModeActive) {
          GME_notification('Editor dev mode is not active.', 'info')
          return
        }

        const host = getEditorDevHost()
        if (host) {
          // Clear the editor dev mode key
          // GM_setValue will automatically trigger GM_addValueChangeListener in all tabs
          GM_setValue(EDITOR_DEV_EVENT_KEY, null)

          GME_notification('Editor dev mode stopped. All tabs will return to normal mode.', 'success')
          GME_info('Editor dev mode manually stopped by user, host: ' + host)
        } else {
          // Clear anyway in case of inconsistent state
          GM_setValue(EDITOR_DEV_EVENT_KEY, null)
          GME_notification('Editor dev mode cleared.', 'success')
          GME_info('Editor dev mode manually cleared by user')
        }
      } else if (activeDevMode === 'local') {
        // Stop local dev mode
        const host = getLocalDevHost()
        if (host === webScriptId) {
          GM_setValue(LOCAL_DEV_EVENT_KEY, null)
          GME_notification('Local file watch stopped. All tabs will return to normal mode.', 'success')
          GME_info('Local file watch manually stopped by user')
        } else {
          GM_setValue(LOCAL_DEV_EVENT_KEY, null)
          GME_notification('Local file watch cleared.', 'success')
          GME_info('Local file watch manually cleared by user')
        }
      }
    })
  }
}
