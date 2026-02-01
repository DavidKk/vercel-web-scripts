/**
 * Editor dev mode handling
 */

import { GME_debug, GME_fail, GME_info } from '../helpers/logger'
import { GME_notification } from '../ui/notification/index'
import { EDITOR_DEV_EVENT_KEY, EDITOR_POST_MESSAGE_TYPE, getActiveDevMode, getEditorDevHost } from './dev-mode'
import { executeEditorScript } from './script-execution'

/**
 * Track if editor script has been executed
 */
let hasExecutedEditorScript = false

/**
 * Get whether editor script has been executed
 */

function getHasExecutedEditorScript(): boolean {
  return hasExecutedEditorScript
}

/**
 * Set whether editor script has been executed
 */

function setHasExecutedEditorScript(value: boolean): void {
  hasExecutedEditorScript = value
}

/**
 * Handle editor dev mode updates from GM_addValueChangeListener
 * This function is called when EDITOR_DEV_EVENT_KEY changes
 * @param oldValue Previous value
 * @param newValue New value
 */

function handleEditorDevModeUpdate(oldValue: any, newValue: any): void {
  // Handle editor dev mode stopped (newValue is null)
  if (!newValue) {
    // Add a short delay before reloading to avoid rapid stop/start cycles
    // This can happen when editor page is refreshed or navigated
    const hasRecentExecution = (window as any).__WEB_SCRIPT_EDITOR_LAST_MODIFIED__
    const now = Date.now()

    if (hasRecentExecution && now - hasRecentExecution < 5000) {
      GME_info('[Editor Dev Mode] Ignoring stop signal (editor may be refreshing)')
      return
    }

    // If this tab was using editor dev mode, reload to go back to normal mode
    if (hasExecutedEditorScript) {
      GME_info('[Editor Dev Mode] Reloading to return to normal mode')
      hasExecutedEditorScript = false
      window.location.reload()
    }
    return
  }

  // Skip if current page is the editor page
  if (window.location.pathname.includes('/tampermonkey/editor')) {
    return
  }

  // If new value does not have compiled content yet, its just the startup signal
  // Wait for the update with actual code
  if (!newValue.compiledContent) {
    GME_info('[Editor Dev Mode] Dev mode started signal received (no content yet), waiting for files...')
    return
  }

  // Skip if this is the same update (same lastModified) and we've already executed
  // This prevents re-execution when the same update is received multiple times
  if (oldValue?.lastModified && newValue?.lastModified && oldValue.lastModified >= newValue.lastModified && hasExecutedEditorScript) {
    return
  }

  const activeHost = getEditorDevHost()
  if (!activeHost) {
    return
  }

  GME_info('[Editor Dev Mode] Processing update from host: ' + activeHost)

  if (newValue.host !== activeHost) {
    return
  }

  // Only trigger reload/re-execute when tab is active to avoid excessive reloads
  const isTabHidden = document.hidden

  // If page is visible, execute immediately regardless of focus
  // If page is hidden, wait for it to become visible
  if (isTabHidden) {
    // Use a flag to avoid multiple pending listeners
    if ((window as any).__WEB_SCRIPT_PENDING_RELOAD__) {
      GME_debug('[Editor Dev Mode] Already waiting for tab visibility, skipping additional listener')
      return
    }
    ;(window as any).__WEB_SCRIPT_PENDING_RELOAD__ = true

    GME_info('[Editor Dev Mode] Editor files updated, but tab is hidden. Will reload when tab becomes visible...')

    // Also add a backup timeout to execute even if tab doesn't become visible
    setTimeout(() => {
      if ((window as any).__WEB_SCRIPT_PENDING_RELOAD__) {
        GME_info('[Editor Dev Mode] Timeout reached, executing script even though tab may be hidden...')
        delete (window as any).__WEB_SCRIPT_PENDING_RELOAD__

        if (hasExecutedEditorScript) {
          executeEditorScript()
        } else {
          window.location.reload()
        }
      }
    }, 3000) // 3 second timeout

    // Wait for tab to become active before reloading
    const onTabActive = (): void => {
      // Only check if tab is hidden, not focus
      if (document.hidden) {
        return
      }

      // Remove listeners
      document.removeEventListener('visibilitychange', onTabActive)
      window.removeEventListener('focus', onTabActive)
      delete (window as any).__WEB_SCRIPT_PENDING_RELOAD__

      // Check if dev mode is still active
      const currentDevMode = GM_getValue(EDITOR_DEV_EVENT_KEY) as { compiledContent?: string } | null
      if (!currentDevMode || !currentDevMode.compiledContent) {
        GME_info('Editor dev mode stopped or no content while waiting for tab to be visible.')
        if (hasExecutedEditorScript && !currentDevMode) {
          hasExecutedEditorScript = false
          window.location.reload()
        }
        return
      }

      if (hasExecutedEditorScript) {
        GME_info('[Editor Dev Mode] Editor files updated, re-executing script (tab now visible)...')
        executeEditorScript()
      } else {
        GME_info('[Editor Dev Mode] Editor dev mode detected, reloading (tab now visible)...')
        window.location.reload()
      }
    }

    document.addEventListener('visibilitychange', onTabActive)
    window.addEventListener('focus', onTabActive)
    return
  }

  // Tab is visible (not hidden), proceed immediately

  if (hasExecutedEditorScript) {
    // Use a flag to prevent multiple simultaneous re-execution attempts
    if ((window as any).__WEB_SCRIPT_REEXECUTING_EDITOR_SCRIPT__) {
      GME_debug('[Editor Dev Mode] Re-execution already in progress, skipping...')
      return
    }

    ;(window as any).__WEB_SCRIPT_REEXECUTING_EDITOR_SCRIPT__ = true
    GME_info('[Editor Dev Mode] Editor files updated, re-executing script...')
    executeEditorScript()
      .then(() => {
        delete (window as any).__WEB_SCRIPT_REEXECUTING_EDITOR_SCRIPT__
      })
      .catch((error: unknown) => {
        delete (window as any).__WEB_SCRIPT_REEXECUTING_EDITOR_SCRIPT__
        GME_fail('[Editor Dev Mode] Error re-executing script: ' + (error instanceof Error ? error.message : String(error)))
      })
    return
  }

  // Script not executed yet, try to execute now
  // Use a flag to prevent multiple simultaneous execution attempts
  if ((window as any).__WEB_SCRIPT_EXECUTING_EDITOR_SCRIPT__) {
    GME_debug('[Editor Dev Mode] Script execution already in progress, skipping...')
    return
  }

  ;(window as any).__WEB_SCRIPT_EXECUTING_EDITOR_SCRIPT__ = true
  executeEditorScript()
    .then((executed: boolean) => {
      delete (window as any).__WEB_SCRIPT_EXECUTING_EDITOR_SCRIPT__
      if (executed) {
        hasExecutedEditorScript = true
      }
    })
    .catch((error: unknown) => {
      delete (window as any).__WEB_SCRIPT_EXECUTING_EDITOR_SCRIPT__
      GME_fail('[Editor Dev Mode] Error executing script: ' + (error instanceof Error ? error.message : String(error)))
    })
}

/**
 * Set up window.postMessage listener for Editor page
 * This allows Editor.tsx (webpage) to communicate with Tampermonkey script
 */

function setupEditorPostMessageListener(): void {
  const isEditorPage = window.location.pathname.includes('/tampermonkey/editor')
  if (!isEditorPage) {
    return
  }

  GME_info('[Main] Editor page detected, setting up window.postMessage listener')
  window.addEventListener('message', (event: MessageEvent) => {
    // Only accept messages from same origin (Editor.tsx is on the same page)
    if (event.origin !== window.location.origin) {
      return
    }

    // Check if it's an editor message
    if (event.data?.type !== EDITOR_POST_MESSAGE_TYPE) {
      return
    }

    const message = event.data.message as {
      type: string
      host?: string
      lastModified?: number
      files?: Record<string, string>
      compiledContent?: string
    }

    GME_info('[Main] Received postMessage from Editor.tsx, type: ' + message.type + ', host: ' + (message.host || 'unknown'))

    // Handle early editor dev mode initialization
    if (message.type === 'editor-dev-mode-early-init') {
      const host = message.host
      if (!host) {
        return
      }

      GME_info('[Main] Editor dev mode early init via postMessage, host: ' + host)
      // Set EDITOR_DEV_EVENT_KEY immediately for early detection
      GM_setValue(EDITOR_DEV_EVENT_KEY, { host, lastModified: 0, files: {}, compiledContent: '', _early: true })
      GME_info('[Main] Early editor dev mode flag set, waiting for real files...')
      return
    }

    // Handle editor-dev-mode-started
    if (message.type === 'editor-dev-mode-started') {
      const host = message.host
      if (!host) {
        return
      }

      GME_info('[Main] Editor dev mode started via postMessage, host: ' + host)

      // Check if another dev mode is active
      const activeDevMode = getActiveDevMode()
      if (activeDevMode === 'local') {
        GME_notification('Local file watch is already running. Please stop it first.', 'error')
        return
      }

      // New host replaces old host directly (simple approach)
      const currentEditorHost = getEditorDevHost()
      if (currentEditorHost && currentEditorHost !== host) {
        GME_info('New editor host replacing old host, old: ' + currentEditorHost + ', new: ' + host)
        // Clear old host
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
      }

      // Set EDITOR_DEV_EVENT_KEY immediately so other tabs can detect editor dev mode
      // Files will be sent later via editor-files-updated message
      const currentState = GM_getValue(EDITOR_DEV_EVENT_KEY) as { host?: string } | null
      if (!currentState || currentState.host !== host) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, { host, lastModified: 0, files: {}, compiledContent: '' })
        GME_info('Editor dev mode flag set via postMessage, host: ' + host + ', waiting for files...')
      } else {
        GME_info('Editor dev mode already active for host: ' + host + ', waiting for files...')
      }
      return
    }

    // Handle editor-dev-mode-stopped
    if (message.type === 'editor-dev-mode-stopped') {
      const host = message.host
      GME_info('[Main] Editor dev mode stopped via postMessage, host: ' + (host || 'unknown'))
      // Editor dev mode stopped, clear the key
      const currentHost = getEditorDevHost()
      if (!currentHost || currentHost === host) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_info('Editor dev mode cleared via postMessage')
      } else {
        GME_info('Host mismatch on stop, current: ' + currentHost + ', stopped: ' + (host || 'unknown') + ', keeping current host')
      }
      return
    }

    // Handle editor-no-files
    if (message.type === 'editor-no-files') {
      const userMessage = (message as any).message
      GME_info('[Editor Dev Mode] ' + (userMessage || 'No script files found in editor'))
      return
    }

    // Handle editor-files-updated
    if (message.type === 'editor-files-updated') {
      const { host, lastModified, files, compiledContent } = message
      if (!host) {
        return
      }

      GME_info(
        '[Main] Received editor-files-updated via postMessage, host: ' +
          host +
          ', lastModified: ' +
          (lastModified || 0) +
          ', file count: ' +
          Object.keys(files || {}).length +
          ', hasCompiledContent: ' +
          !!compiledContent
      )

      // Check if another dev mode is active
      const activeDevMode = getActiveDevMode()
      if (activeDevMode === 'local') {
        GME_info('Local file watch is active, ignoring editor update')
        return
      }

      // Check if this is the active editor host or if no editor host is set yet
      const currentEditorHost = getEditorDevHost()
      if (currentEditorHost && currentEditorHost !== host) {
        GME_info('Host mismatch, current: ' + currentEditorHost + ', received: ' + host + ', ignoring update')
        return
      }

      // Only editor tab executes GM_setValue (this will trigger GM_addValueChangeListener in all tabs)
      const currentState = GM_getValue(EDITOR_DEV_EVENT_KEY) as { lastModified?: number; compiledContent?: string } | null
      // Only skip if we already have compiledContent and lastModified is newer or equal
      // If currentState has no compiledContent (just the initial flag), always update
      if (currentState?.compiledContent && currentState?.lastModified && lastModified && currentState.lastModified >= lastModified) {
        GME_info('No update needed, current lastModified: ' + currentState.lastModified + ', received: ' + lastModified)
        return
      }

      // Always update if we don't have compiledContent yet, or if lastModified is newer
      // Remove _early flag when real files arrive
      const newValue = { host, lastModified: lastModified || Date.now(), files: files || {}, compiledContent: compiledContent || '' }
      GM_setValue(EDITOR_DEV_EVENT_KEY, newValue)
      GME_info('Editor dev mode files stored via postMessage, host: ' + host + ', file count: ' + Object.keys(files || {}).length + ', hasCompiledContent: ' + !!compiledContent)
      // GM_setValue will automatically trigger GM_addValueChangeListener in all tabs (including this one)
      return
    }
  })
}

export { getHasExecutedEditorScript, handleEditorDevModeUpdate, setHasExecutedEditorScript, setupEditorPostMessageListener }
