/**
 * Menu registration functions
 */

import { GME_fetch } from '@/helpers/http'
import { GME_debug, GME_fail, GME_ok } from '@/helpers/logger'
import { fetchAndCacheRules } from '@/rules'
import { EDITOR_DEV_EVENT_KEY, getActiveDevMode, getEditorDevHost, isEditorDevMode } from '@/services/dev-mode'
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
   * Handle update script menu - check script validity and open update URL
   * Similar to editor update button: check script, then open new page for Tampermonkey to auto-update
   */
  GM_registerMenuCommand('Update Script', async () => {
    try {
      GME_debug('[Update Script] Checking script validity...')

      // Extract key from script URL (e.g., /static/{key}/tampermonkey.user.js)
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

      // Check if tampermonkey.user.js exists (HEAD request)
      let url: string | null = null
      try {
        const userResponse = await GME_fetch(userUrl, { method: 'HEAD' })
        if (userResponse.ok) {
          url = userUrl
          GME_ok('[Update Script] Script validation passed (tampermonkey.user.js found)')
        } else {
          GME_fail('[Update Script] Script validation failed: tampermonkey.user.js is not available')
          GME_notification('Script compilation failed. Please check for errors in the editor.', 'error', 5000)
          return
        }
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        GME_fail('[Update Script] Script validation failed: ' + errorMessage)
        GME_debug('[Update Script] Opening launcher URL due to network error')
        url = userUrl
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
