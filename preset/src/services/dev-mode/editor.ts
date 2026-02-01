/**
 * Editor dev mode handling
 */

import { GME_debug } from '@/helpers/logger'
import { EDITOR_DEV_EVENT_KEY, EDITOR_POST_MESSAGE_TYPE, getActiveDevMode, getEditorDevHost, isEditorDevMode, isEditorPage } from '@/services/dev-mode/constants'
import { executeEditorScript } from '@/services/script-execution'
import { GME_notification } from '@/ui/notification/index'

/** Fingerprint compiled content so we only re-execute when it actually changed (safety net if editor sends duplicate) */
function compiledContentFingerprint(compiledContent: string): string {
  if (!compiledContent) return ''
  let h = 0
  for (let i = 0; i < compiledContent.length; i++) {
    h = ((h << 5) - h + compiledContent.charCodeAt(i)) | 0
  }
  return String(h) + '_' + compiledContent.length
}

/**
 * Track if editor script has been executed
 */
let hasExecutedEditorScript = false

/**
 * Get whether editor script has been executed
 */
export function getHasExecutedEditorScript(): boolean {
  return hasExecutedEditorScript
}

/**
 * Set whether editor script has been executed
 */
export function setHasExecutedEditorScript(value: boolean): void {
  hasExecutedEditorScript = value
}

/**
 * Try to execute editor script if conditions are met (editor dev mode, non-editor page, host available).
 * @returns Promise that resolves to true if script was executed or if editor dev mode is active (to prevent remote script execution)
 */
export async function tryExecuteEditorScript(): Promise<boolean> {
  const isRemote = typeof __IS_REMOTE_EXECUTE__ === 'boolean' && __IS_REMOTE_EXECUTE__
  if (getHasExecutedEditorScript() || isRemote) {
    return false
  }
  if (isEditorPage()) {
    return false
  }
  if (isEditorDevMode()) {
    const host = getEditorDevHost()
    if (!host) {
      return false
    }
    const executed = await executeEditorScript()
    if (executed) {
      setHasExecutedEditorScript(true)
      return true
    }
    return true
  }
  return false
}

/**
 * Handle editor dev mode updates from GM_addValueChangeListener
 * This function is called when EDITOR_DEV_EVENT_KEY changes
 * @param oldValue Previous value
 * @param newValue New value
 */
export function handleEditorDevModeUpdate(oldValue: any, newValue: any): void {
  // Handle editor dev mode stopped (newValue is null)
  if (!newValue) {
    // Add a short delay before reloading to avoid rapid stop/start cycles
    // This can happen when editor page is refreshed or navigated
    const hasRecentExecution = (window as any).__WEB_SCRIPT_EDITOR_LAST_MODIFIED__
    const now = Date.now()

    if (hasRecentExecution && now - hasRecentExecution < 5000) {
      GME_debug('[Editor Dev Mode] Ignoring stop signal (editor may be refreshing)')
      return
    }

    // If this tab was using editor dev mode, reload to go back to normal mode
    if (hasExecutedEditorScript) {
      GME_debug('[Editor Dev Mode] Reloading to return to normal mode')
      hasExecutedEditorScript = false
      window.location.reload()
    }
    return
  }

  // Skip if current page is the editor page
  if (isEditorPage()) {
    return
  }

  // If new value does not have compiled content yet, its just the startup signal
  // Wait for the update with actual code
  if (!newValue.compiledContent) {
    GME_debug('[Editor Dev Mode] Dev mode started signal received (no content yet), waiting for files...')
    return
  }

  // Skip if this is the same update (same lastModified) to avoid redundant reload
  if (oldValue?.lastModified && newValue?.lastModified && oldValue.lastModified >= newValue.lastModified) {
    return
  }

  const activeHost = getEditorDevHost()
  if (!activeHost) {
    return
  }

  GME_debug('[Editor Dev Mode] Processing update from host: ' + activeHost)

  if (newValue.host !== activeHost) {
    return
  }

  // Skip reload when compiled content unchanged (safety net; editor should already send only on change)
  const contentFingerprint = compiledContentFingerprint(newValue.compiledContent || '')
  const lastFingerprint = (window as any).__WEB_SCRIPT_LAST_EXECUTED_EDITOR_FINGERPRINT__
  if (contentFingerprint && contentFingerprint === lastFingerprint) {
    GME_debug('[Editor Dev Mode] Compiled content unchanged, skipping reload')
    return
  }

  // Only reload on real update (listener fired with oldValue), not on initial load (main passed null as oldValue)
  // Otherwise pages would reload in a loop when EDITOR_DEV_EVENT_KEY has stale value from a previous session
  if (oldValue === null) {
    GME_debug('[Editor Dev Mode] Existing value on load, skipping reload (only reload when editor pushes new update)')
    return
  }

  // Only active tab triggers reload immediately; hidden tab schedules reload when it becomes active
  if (document.hidden) {
    GME_debug('[Editor Dev Mode] Editor files updated, but tab is not active, will reload when tab becomes visible')
    scheduleReloadWhenTabActive(newValue)
    return
  }

  // Notify user then reload after delay so they see the message
  GME_notification('Script has been updated', 'success', 1000)
  GME_debug('[Editor Dev Mode] Editor files updated, reloading page (active tab) in 1s...')
  setTimeout(() => {
    window.location.reload()
  }, 1000)
}

const PENDING_RELOAD_KEY = '__WEB_SCRIPT_PENDING_EDITOR_RELOAD__'

/**
 * When tab was hidden on update, schedule a reload when tab becomes active.
 * Uses visibilitychange so the tab reloads once the user switches to it.
 */
function scheduleReloadWhenTabActive(pendingValue: { lastModified?: number; compiledContent?: string; host?: string }): void {
  const win = typeof window !== 'undefined' ? (window as any) : undefined
  if (!win) return
  const alreadyHadPending = !!win[PENDING_RELOAD_KEY]
  win[PENDING_RELOAD_KEY] = { lastModified: pendingValue?.lastModified || 0 }
  if (alreadyHadPending) {
    GME_debug('[Editor Dev Mode] Already have pending reload on visibility, updated lastModified')
    return
  }

  const onVisible = (): void => {
    if (document.hidden) return
    document.removeEventListener('visibilitychange', onVisible)
    const pending = win[PENDING_RELOAD_KEY]
    win[PENDING_RELOAD_KEY] = undefined
    if (!pending) return
    const current = GM_getValue(EDITOR_DEV_EVENT_KEY) as { lastModified?: number; compiledContent?: string; host?: string } | null
    if (!current?.compiledContent) {
      GME_debug('[Editor Dev Mode] Tab became visible but editor dev mode stopped or no content, skipping reload')
      return
    }
    if (getEditorDevHost() !== current.host) return
    GME_notification('Script has been updated', 'success', 1000)
    GME_debug('[Editor Dev Mode] Tab became active, reloading page (pending update) in 1s...')
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  }

  document.addEventListener('visibilitychange', onVisible)
}

/**
 * Set up window.postMessage listener for Editor page
 * This allows Editor.tsx (webpage) to communicate with Tampermonkey script
 */
export function setupEditorPostMessageListener(): void {
  if (!isEditorPage()) {
    return
  }

  GME_debug('[Main] Editor page detected, setting up window.postMessage listener')
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

    GME_debug('[Main] Received postMessage from Editor.tsx, type: ' + message.type + ', host: ' + (message.host || 'unknown'))

    // Handle early editor dev mode initialization
    if (message.type === 'editor-dev-mode-early-init') {
      const host = message.host
      if (!host) {
        return
      }

      GME_debug('[Main] Editor dev mode early init via postMessage, host: ' + host)
      // Set EDITOR_DEV_EVENT_KEY immediately for early detection
      GM_setValue(EDITOR_DEV_EVENT_KEY, { host, lastModified: 0, files: {}, compiledContent: '', _early: true })
      GME_debug('[Main] Early editor dev mode flag set, waiting for real files...')
      return
    }

    // Handle editor-dev-mode-started
    if (message.type === 'editor-dev-mode-started') {
      const host = message.host
      if (!host) {
        return
      }

      GME_debug('[Main] Editor dev mode started via postMessage, host: ' + host)

      // Check if another dev mode is active
      const activeDevMode = getActiveDevMode()
      if (activeDevMode === 'local') {
        GME_notification('Local file watch is already running. Please stop it first.', 'error')
        return
      }

      // New host replaces old host directly (simple approach)
      const currentEditorHost = getEditorDevHost()
      if (currentEditorHost && currentEditorHost !== host) {
        GME_debug('New editor host replacing old host, old: ' + currentEditorHost + ', new: ' + host)
        // Clear old host
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
      }

      // Set EDITOR_DEV_EVENT_KEY immediately so other tabs can detect editor dev mode
      // Files will be sent later via editor-files-updated message
      const currentState = GM_getValue(EDITOR_DEV_EVENT_KEY) as { host?: string } | null
      if (!currentState || currentState.host !== host) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, { host, lastModified: 0, files: {}, compiledContent: '' })
        GME_debug('Editor dev mode flag set via postMessage, host: ' + host + ', waiting for files...')
      } else {
        GME_debug('Editor dev mode already active for host: ' + host + ', waiting for files...')
      }
      return
    }

    // Handle editor-dev-mode-stopped
    if (message.type === 'editor-dev-mode-stopped') {
      const host = message.host
      GME_debug('[Main] Editor dev mode stopped via postMessage, host: ' + (host || 'unknown'))
      // Editor dev mode stopped, clear the key
      const currentHost = getEditorDevHost()
      if (!currentHost || currentHost === host) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_debug('Editor dev mode cleared via postMessage')
      } else {
        GME_debug('Host mismatch on stop, current: ' + currentHost + ', stopped: ' + (host || 'unknown') + ', keeping current host')
      }
      return
    }

    // Handle editor-no-files
    if (message.type === 'editor-no-files') {
      const userMessage = (message as any).message
      GME_debug('[Editor Dev Mode] ' + (userMessage || 'No script files found in editor'))
      return
    }

    // Handle editor-files-updated
    if (message.type === 'editor-files-updated') {
      const { host, lastModified, files, compiledContent } = message
      if (!host) {
        return
      }

      GME_debug(
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
        GME_debug('Local file watch is active, ignoring editor update')
        return
      }

      // Check if this is the active editor host or if no editor host is set yet
      const currentEditorHost = getEditorDevHost()
      if (currentEditorHost && currentEditorHost !== host) {
        GME_debug('Host mismatch, current: ' + currentEditorHost + ', received: ' + host + ', ignoring update')
        return
      }

      // Only editor tab executes GM_setValue (this will trigger GM_addValueChangeListener in all tabs)
      const currentState = GM_getValue(EDITOR_DEV_EVENT_KEY) as { lastModified?: number; compiledContent?: string } | null
      // Only skip if we already have compiledContent and lastModified is newer or equal
      // If currentState has no compiledContent (just the initial flag), always update
      if (currentState?.compiledContent && currentState?.lastModified && lastModified && currentState.lastModified >= lastModified) {
        GME_debug('No update needed, current lastModified: ' + currentState.lastModified + ', received: ' + lastModified)
        return
      }

      // Always update if we don't have compiledContent yet, or if lastModified is newer
      // Remove _early flag when real files arrive
      const newValue = { host, lastModified: lastModified || Date.now(), files: files || {}, compiledContent: compiledContent || '' }
      GM_setValue(EDITOR_DEV_EVENT_KEY, newValue)
      GME_debug('Editor dev mode files stored via postMessage, host: ' + host + ', file count: ' + Object.keys(files || {}).length + ', hasCompiledContent: ' + !!compiledContent)
      // GM_setValue will automatically trigger GM_addValueChangeListener in all tabs (including this one)
      return
    }
  })
}
