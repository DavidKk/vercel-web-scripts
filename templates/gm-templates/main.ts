const WEB_SCRIPT_ID = GME_uuid()
const IS_REMOTE_SCRIPT = typeof __IS_REMOTE_EXECUTE__ === 'boolean' && __IS_REMOTE_EXECUTE__
// Use window.location.host instead of hostname to include port number
const IS_DEVELOP_MODE = __IS_DEVELOP_MODE__ && __HOSTNAME_PORT__ === window.location.host

// Guard against multiple initializations
if ((window as any).__WEB_SCRIPT_INITIALIZED__) {
  GME_info('[Main] Loader already running, skipping initialization')
  // We return empty string or null to satisfy callers if needed, but here it's top-level
} else {
  ;(window as any).__WEB_SCRIPT_INITIALIZED__ = WEB_SCRIPT_ID
}

const LOCAL_DEV_EVENT_KEY = 'files@web-script-dev'
const EDITOR_DEV_EVENT_KEY = 'files@web-script-editor-dev'
const EDITOR_POST_MESSAGE_TYPE = 'web-script-editor-message'

/**
 * Check if local dev mode is active
 * @returns {boolean} True if local dev mode is active
 */
function isLocalDevMode(): boolean {
  return !!GM_getValue(LOCAL_DEV_EVENT_KEY)
}

/**
 * Get the host ID of the active local dev mode
 * @returns {string} The host ID or empty string
 */
function getLocalDevHost(): string {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { host?: string } | null
  return response?.host || ''
}

/**
 * Get the files from local dev mode
 * @returns {Object} The files object or empty object
 */
function getLocalDevFiles(): Record<string, string> {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { files?: Record<string, string> } | null
  return response?.files || {}
}

/**
 * Check if editor dev mode is active
 * @returns {boolean} True if editor dev mode is active
 */
function isEditorDevMode(): boolean {
  return !!GM_getValue(EDITOR_DEV_EVENT_KEY)
}

/**
 * Get the host ID of the active editor dev mode
 * @returns {string} The host ID or empty string
 */
function getEditorDevHost(): string {
  const response = GM_getValue(EDITOR_DEV_EVENT_KEY) as { host?: string } | null
  return response?.host || ''
}

/**
 * Check if any dev mode is active
 * @returns {string|null} Returns 'local' if local dev mode is active, 'editor' if editor dev mode is active, null otherwise
 */
function getActiveDevMode(): 'local' | 'editor' | null {
  if (isLocalDevMode()) {
    return 'local'
  }
  if (isEditorDevMode()) {
    return 'editor'
  }
  return null
}

/**
 * Execute script content in a sandboxed environment
 * @param content Script content to execute
 */
function executeScript(content: string): void {
  const execute = new Function('global', `with(global){${content}}`)
  const grants = eval(`({ ${__GRANTS_STRING__} })`)
  execute({ window, GME_preview, ...grants, __IS_REMOTE_EXECUTE__: true })
}

/**
 * Execute remote script from URL
 * @param url Script URL to fetch and execute
 */
async function executeRemoteScript(url: string = __SCRIPT_URL__): Promise<void> {
  const content = await fetchScript(url)
  if (!content) {
    return
  }

  GME_ok('Remote script fetched successfully.')
  executeScript(content)
}

/**
 * Execute local dev mode script
 */
async function executeLocalScript(): Promise<void> {
  if (!isLocalDevMode()) {
    return
  }

  // Get the host from cache (could be this tab or another tab)
  const host = getLocalDevHost()
  if (!host) {
    return
  }

  // Get files and compiled content from cache (stored by the host tab)
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { files?: Record<string, string>; compiledContent?: string } | null
  const files = response?.files || {}
  const compiledContent = response?.compiledContent

  if (Object.keys(files).length === 0) {
    return
  }

  // Compiled content is required - if not available, compilation failed on host side
  if (!compiledContent) {
    GME_fail('[Local Dev Mode] No compiled content available. Compilation may have failed on host side.')
    return
  }

  GME_ok('[Local Dev Mode] Local script ready, executing...')
  executeScript(compiledContent)
}

/**
 * Execute editor dev mode script
 * @returns {boolean} True if script was executed, false if waiting for files
 */
async function executeEditorScript(): Promise<boolean> {
  if (!isEditorDevMode()) {
    return false
  }

  const host = getEditorDevHost()
  if (!host) {
    return false
  }

  // Get files and compiled content from GM_setValue (like Local Dev Mode)
  const response = GM_getValue(EDITOR_DEV_EVENT_KEY) as { files?: Record<string, string>; compiledContent?: string; lastModified?: number; _early?: boolean } | null
  const files = response?.files || {}
  const compiledContent = response?.compiledContent
  const lastModified = response?.lastModified || 0
  const isEarlyInit = response?._early || false

  if (Object.keys(files).length === 0) {
    if (isEarlyInit) {
      GME_info('[Editor Dev Mode] Early initialization detected, waiting for real files from editor...')
      return true // Return true to keep DEV MODE active, files will come later
    }
    return false
  }

  try {
    // Compiled content is required - if not available, wait for editor to send it
    if (!compiledContent) {
      if (isEarlyInit) {
        GME_info('[Editor Dev Mode] Early initialization - no compiled content yet. DEV MODE active, waiting for files...')
        return true // Keep DEV MODE active
      }
      GME_info('[Editor Dev Mode] No compiled content available yet. Waiting for editor to compile and send files...')
      return false
    }

    /**
     * Prevent re-executing the same editor build in a loop.
     * The editor host may broadcast the same payload multiple times (or multiple listeners may process it).
     * We only execute when lastModified advances.
     */
    const lastExecuted = (window as any).__WEB_SCRIPT_EDITOR_LAST_MODIFIED__ as number | undefined
    if (typeof lastExecuted === 'number' && lastExecuted >= lastModified) {
      GME_debug('[Editor Dev Mode] Editor script already executed, skipping. lastExecuted: ' + lastExecuted + ', lastModified: ' + lastModified)
      return true
    }
    ;(window as any).__WEB_SCRIPT_EDITOR_LAST_MODIFIED__ = lastModified

    GME_ok('[Editor Dev Mode] Executing editor script')
    executeScript(compiledContent)
    GME_ok('[Editor Dev Mode] Editor script executed successfully')
    return true
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    GME_fail('[Editor Dev Mode] Failed to execute editor script: ' + errorMessage)
    return false
  }
}

/**
 * Watch HMR updates via WebSocket
 * @param callbacks Callback functions for different events
 */
function watchHMRUpdates({ onOpen, onClose, onError, onUpdate }: { onOpen?: () => void; onClose?: () => void; onError?: () => void; onUpdate?: () => void }): void {
  const ws = new WebSocket(__HMK_URL__)
  ws.addEventListener('open', () => {
    GME_ok('Connected to HMR WebSocket')

    onOpen && onOpen()
  })

  ws.addEventListener('close', async () => {
    GME_info('HMR WebSocket closed')

    onClose && onClose()
    setTimeout(() => watchHMRUpdates({ onOpen: onUpdate }), 3e3)
  })

  ws.addEventListener('error', () => {
    GME_fail('HMR WebSocket error')

    onError && onError()
  })

  ws.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data)
      switch (data.action) {
        case 'serverComponentChanges':
          onUpdate && onUpdate()
          break

        case 'serverError':
        case 'error':
          GME_fail('HMR error:' + event.data)
          break
      }
    } catch (err) {
      GME_fail('Non-JSON HMR message:', event.data)
    }
  })
}

let hasExecutedLocalScript = false
let hasExecutedEditorScript = false

/**
 * Global rules cache for matchRule function
 * Updated in main() function after fetching rules
 */
let globalRules: Array<{ wildcard?: string; script?: string }> = []

/**
 * Handle editor dev mode updates from GM_addValueChangeListener
 * This function is called when EDITOR_DEV_EVENT_KEY changes
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
      .catch((error) => {
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
    .then((executed) => {
      delete (window as any).__WEB_SCRIPT_EXECUTING_EDITOR_SCRIPT__
      if (executed) {
        hasExecutedEditorScript = true
      }
    })
    .catch((error) => {
      delete (window as any).__WEB_SCRIPT_EXECUTING_EDITOR_SCRIPT__
      GME_fail('[Editor Dev Mode] Error executing script: ' + (error instanceof Error ? error.message : String(error)))
    })
}

/**
 * Match rule function for dynamically compiled scripts
 * This function is called by dynamically compiled scripts from createUserScript.server.ts
 * Must be available globally, so defined outside main() function
 * @param name Script name to match
 * @param url URL to match against (defaults to current page URL)
 * @returns True if rule matches
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function matchRule(name: string, url: string = window.location.href): boolean {
  return globalRules.some(({ wildcard, script }) => {
    if (script !== name) {
      return false
    }

    return wildcard && matchUrl(wildcard, url)
  })
}

/**
 * Try to execute local script if conditions are met
 * @returns {boolean} True if script was executed
 */
function tryExecuteLocalScript(): boolean {
  if (hasExecutedLocalScript || IS_REMOTE_SCRIPT) {
    return false
  }

  // Editor page (HOST) should not execute scripts, it only sends files to other pages
  if (window.location.pathname.includes('/tampermonkey/editor')) {
    return false
  }

  if (isLocalDevMode()) {
    // Check if there are cached files (from host tab)
    const host = getLocalDevHost()
    if (!host) {
      return false
    }

    // Check if there are files to execute
    const files = getLocalDevFiles()
    if (Object.keys(files).length === 0) {
      return false
    }

    // Execute script (works for both host and non-host tabs)
    hasExecutedLocalScript = true
    executeLocalScript()
    return true
  }
  return false
}

/**
 * Try to execute editor script if conditions are met
 * @returns {Promise<boolean>} True if script was executed or if editor dev mode is active (to prevent remote script execution)
 */
async function tryExecuteEditorScript(): Promise<boolean> {
  if (hasExecutedEditorScript || IS_REMOTE_SCRIPT) {
    return false
  }

  // Editor page (HOST) should not execute scripts, it only sends files to other pages
  if (window.location.pathname.includes('/tampermonkey/editor')) {
    return false
  }

  if (isEditorDevMode()) {
    const host = getEditorDevHost()
    if (!host) {
      return false
    }

    // Try to execute script immediately if files are already available
    const executed = await executeEditorScript()

    // If script was executed, mark as executed
    if (executed) {
      hasExecutedEditorScript = true
      return true
    }

    // If script was not executed (files not ready yet)
    // Don't poll or timeout - GM_addValueChangeListener will handle file updates
    // When editor sends files via postMessage -> GM_setValue, the listener will trigger
    // handleEditorDevModeUpdate which will execute the script

    // Return true to indicate dev mode is active and prevent remote script execution
    // The script will be executed automatically when files arrive via GM_addValueChangeListener
    return true
  }

  return false
}

/**
 * Main function that orchestrates script execution
 */
async function main(): Promise<void> {
  GME_info('[Main] Starting main function, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)

  // Set up GM_addValueChangeListener early so we can receive messages from Editor page (even if cross-domain)
  // This must be set up before checking editor dev mode, so we can receive messages immediately
  GM_addValueChangeListener(EDITOR_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    handleEditorDevModeUpdate(oldValue, newValue)
  })
  GME_info('[Main] GM_addValueChangeListener for EDITOR_DEV_EVENT_KEY set up early')

  // Check if editor dev mode is already active (Editor page may have set it before this script loaded)
  const existingEditorDevMode = GM_getValue(EDITOR_DEV_EVENT_KEY)
  if (existingEditorDevMode) {
    GME_info('[Main] Editor dev mode already active when script loaded, processing existing value')
    // Trigger handler with null as oldValue to simulate initial load
    handleEditorDevModeUpdate(null, existingEditorDevMode)
  }

  // Set up window.postMessage listener for Editor page (to receive messages from Editor.tsx)
  // This allows Editor.tsx (webpage) to communicate with Tampermonkey script
  const isEditorPage = window.location.pathname.includes('/tampermonkey/editor')
  if (isEditorPage) {
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

  // Check dev modes first (editor dev mode works in both dev and prod)
  const hasLocalDevMode = isLocalDevMode()
  const hasEditorDevMode = isEditorDevMode()

  // Only clear dev mode flags in development mode if they are not active
  if (IS_DEVELOP_MODE) {
    // Only clear local dev mode flag if there's no active host
    if (hasLocalDevMode) {
      const localHost = getLocalDevHost()
      if (!localHost) {
        GM_setValue(LOCAL_DEV_EVENT_KEY, null)
        GME_info('[Dev Mode] Cleared residual local dev mode flag (no active host)')
      }
    }

    // Only clear editor dev mode flag if there's no active host
    // This allows editor dev mode to persist across page refreshes
    if (hasEditorDevMode) {
      const editorHost = getEditorDevHost()
      if (!editorHost) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_info('[Dev Mode] Cleared residual editor dev mode flag (no active host)')
      } else {
        GME_info('[Dev Mode] Editor dev mode has active host: ' + editorHost + ', keeping flag')
      }
    }
  } else if (hasEditorDevMode) {
    // In production mode, still validate editor dev mode host
    const editorHost = getEditorDevHost()
    if (!editorHost) {
      GM_setValue(EDITOR_DEV_EVENT_KEY, null)
      GME_info('[Editor Dev Mode] Cleared residual editor dev mode flag (no active host)')
    } else {
      GME_info('[Editor Dev Mode] Editor dev mode has active host in production mode: ' + editorHost)
    }
  }

  // Try local script only in development mode
  if (IS_DEVELOP_MODE && tryExecuteLocalScript()) {
    GME_info('[Main] Local dev mode active, executing local script')
    function handleLocalScriptUpdate(oldValue: any, newValue: any): void {
      if (!newValue) {
        return
      }

      if (oldValue?.lastModified >= newValue?.lastModified) {
        return
      }

      // Check if there are cached files (from host tab)
      if (!getLocalDevHost()) {
        return
      }

      // Re-execute script (works for both host and non-host tabs)
      GME_info('[Local Dev Mode] Local files updated, re-executing script...')
      executeLocalScript()
    }

    GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
      handleLocalScriptUpdate(oldValue, newValue)
    })

    return
  }

  const editorScriptResult = await tryExecuteEditorScript()
  if (editorScriptResult) {
    // EDITOR_DEV_EVENT_KEY listener is already set up early in main() function
    // The global handler (handleEditorDevModeUpdate) will handle all updates
    // If files are not ready yet, they will be executed automatically when editor sends them
    return
  }

  GME_info('[Main] After editor script check, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)
  if (IS_DEVELOP_MODE && !IS_REMOTE_SCRIPT) {
    GME_info('[Main] Entering dev mode path')
    // Editor page (HOST) should not execute remote scripts in dev mode
    // It only sends files to other pages via GM_setValue (triggered by postMessage from Editor.tsx)
    if (window.location.pathname.includes('/tampermonkey/editor')) {
      GME_info('[Dev Mode] Current page is editor page (HOST), skipping remote script execution')
      // Initialize script-update service to listen for updates (but don't execute)
      getScriptUpdate()
      return
    }

    GME_info('[Main] Non-editor page in dev mode, initializing services and executing remote script')
    // Initialize script-update service to listen for update messages
    getScriptUpdate()

    watchHMRUpdates({
      onUpdate: () => window.location.reload(),
    })

    GME_info('Development mode')
    executeRemoteScript()
    return
  }

  GME_info('[Main] Not in dev mode path, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)

  if (IS_REMOTE_SCRIPT) {
    GME_info('[Main] IS_REMOTE_SCRIPT=true, executing remote script')
  }

  GME_info('[Main] Fetching rules and setting up matchRule function')
  // Fetch rules and update global cache for matchRule function
  const rules = await fetchRulesFromCache()
  globalRules = rules
  GME_info('[Main] Rules fetched, count: ' + rules.length)

  /**
   * Execute GIST compiled scripts
   * This function body will be replaced with actual GIST scripts code at compile time
   */
  function executeGistScripts(): void {
    // @ts-expect-error - Placeholder will be replaced with actual GIST scripts code at runtime
    __GIST_SCRIPTS_PLACEHOLDER__
  }

  // Execute GIST scripts at the correct position
  executeGistScripts()

  GM_registerMenuCommand('Edit Script', () => {
    window.open(__EDITOR_URL__, '_blank')
  })

  GM_registerMenuCommand('Update Script', async () => {
    const scriptUpdate = getScriptUpdate()
    await scriptUpdate.update()
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
        if (host === WEB_SCRIPT_ID) {
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

  let isDevMode = false
  let pollInterval: number | null = null
  let watchLocalFilesMenuId: number | null = null

  /**
   * Register or update Watch Local Files menu with current status
   */
  function registerWatchLocalFilesMenu(): void {
    const isLocalDevModeActive = isLocalDevMode()
    const menuText = isLocalDevModeActive ? 'Watching Local Files' : 'Watch Local Files'

    // Unregister existing menu if exists
    if (watchLocalFilesMenuId !== null) {
      try {
        GM_unregisterMenuCommand(watchLocalFilesMenuId)
      } catch (e) {
        // Ignore if menu doesn't exist
      }
    }

    // Register new menu with current status
    watchLocalFilesMenuId = GM_registerMenuCommand(menuText, async () => {
      // Check current status when clicked (not the static value at registration time)
      const currentLocalDevModeActive = isLocalDevMode()

      // If already active, stop it
      if (currentLocalDevModeActive) {
        const host = getLocalDevHost()
        if (host === WEB_SCRIPT_ID) {
          GM_setValue(LOCAL_DEV_EVENT_KEY, null)
          GME_notification('Local file watch stopped. All tabs will return to normal mode.', 'success')
          GME_info('Local file watch manually stopped by user')
          // Update menu text
          registerWatchLocalFilesMenu()
        } else {
          GM_setValue(LOCAL_DEV_EVENT_KEY, null)
          GME_notification('Local file watch cleared.', 'success')
          GME_info('Local file watch manually cleared by user')
          // Update menu text
          registerWatchLocalFilesMenu()
        }
        return
      }

      // If not active, start it
      const activeDevMode = getActiveDevMode()
      if (activeDevMode) {
        GME_notification(`${activeDevMode === 'local' ? 'Local file watch' : 'Editor dev mode'} is already running. Please stop it first.`, 'error')
        return
      }

      const host = getLocalDevHost()
      if (host) {
        GME_notification('Another local file watch is running.', 'error')
        return
      }

      const dirHandle = await window.showDirectoryPicker()
      await dirHandle.requestPermission({ mode: 'read' })

      GME_notification('Watching local files. Leaving will stop file watch.', 'success')
      isDevMode = true

      window.addEventListener('beforeunload', (event) => {
        event.preventDefault()
        ;(event as any).returnValue = ''
      })

      window.addEventListener('unload', () => {
        GM_setValue(LOCAL_DEV_EVENT_KEY, null)
        if (pollInterval) {
          clearInterval(pollInterval)
        }
      })

      const files: Record<string, string> = {}
      const modifies: Record<string, number> = {}

      async function* walkDir(
        handle: FileSystemDirectoryHandle,
        relativePath = ''
      ): AsyncGenerator<{
        entry: FileSystemFileHandle
        path: string
      }> {
        for await (const [name, entry] of handle.entries()) {
          const currentPath = relativePath ? `${relativePath}/${name}` : name
          if (entry.kind === 'file' && name.endsWith('.ts')) {
            yield { entry: entry as FileSystemFileHandle, path: currentPath }
            continue
          }

          if (entry.kind === 'directory') {
            yield* walkDir(entry as FileSystemDirectoryHandle, currentPath)
            continue
          }
        }
      }

      async function pollFiles(): Promise<void> {
        let hasModified = false
        let lastModified = 0

        for await (const { entry, path } of walkDir(dirHandle)) {
          const file = await entry.getFile()
          if (modifies[path] === file.lastModified) {
            lastModified = Math.max(lastModified, file.lastModified)
            continue
          }

          modifies[path] = file.lastModified
          files[path] = await file.text()

          lastModified = Math.max(lastModified, file.lastModified)
          hasModified = true
        }

        // Compile files if modified - if compilation fails, don't send update
        let compiledContent: string | null = null
        if (hasModified && Object.keys(files).length > 0) {
          try {
            GME_info('[Local Dev Mode] Compiling local files...')
            compiledContent = await fetchCompileScript(__BASE_URL__, files)
            if (!compiledContent) {
              throw new Error('Compilation returned empty content')
            }
            GME_ok('[Local Dev Mode] Local files compiled successfully')
          } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            GME_fail('[Local Dev Mode] Failed to compile local files: ' + errorMessage)
            // Don't send update if compilation fails
            return
          }
        }

        const state = { host: WEB_SCRIPT_ID, lastModified, files, compiledContent }
        const currentState = GM_getValue(LOCAL_DEV_EVENT_KEY) as { lastModified?: number } | null

        if (!currentState || !currentState.lastModified || currentState.lastModified < lastModified) {
          // GM_setValue will automatically trigger GM_addValueChangeListener in all tabs
          GM_setValue(LOCAL_DEV_EVENT_KEY, state)

          if (hasModified) {
            GME_info('[Local Dev Mode] Local files modified, GM_setValue triggered, all tabs will receive update via GM_addValueChangeListener...')
          }
        }
      }

      await pollFiles()
      pollInterval = setInterval(pollFiles, 5e3) as unknown as number

      // Update menu text after starting
      registerWatchLocalFilesMenu()
    })
  }

  // Initial registration
  registerWatchLocalFilesMenu()

  // Listen for status changes to update menu
  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, () => {
    registerWatchLocalFilesMenu()
  })

  /**
   * Create a reload handler with waiting for tab to be active
   * @param modeName Name of the dev mode (for logging)
   * @param checkDevMode Function to check if dev mode is still active
   * @returns Reload function that returns false if tab is not active
   */
  function createReloadHandler(modeName: string, checkDevMode: () => boolean): void {
    const reload = (): boolean => {
      const isActive = !document.hidden && document.hasFocus()
      if (!isActive) {
        return false
      }

      GME_info(modeName + ' dev mode detected, reloading...')
      window.location.reload()
      return true
    }

    if (reload() === false) {
      GME_info(modeName + ' dev mode detected, waiting for tab to be active...')

      const onReload = (): void => {
        if (!checkDevMode()) {
          GME_info(modeName + ' dev mode stopped.')
          document.removeEventListener('visibilitychange', onReload)
          window.removeEventListener('focus', onReload)
          return
        }

        reload()
      }

      document.addEventListener('visibilitychange', onReload)
      window.addEventListener('focus', onReload)
    }
  }

  function handleLocalDevModeUpdate(oldValue: any, newValue: any): void {
    if (isDevMode) {
      return
    }

    if (!newValue) {
      return
    }

    if (oldValue?.lastModified >= newValue?.lastModified) {
      return
    }

    // Check if this tab is the host (the one that started local dev mode)
    const currentHost = getLocalDevHost()
    if (!currentHost) {
      return
    }

    // Only process updates from the active host
    if (newValue.host !== currentHost) {
      return
    }

    // If already executed script, re-execute directly
    if (hasExecutedLocalScript) {
      GME_info('[Local Dev Mode] Local files updated, re-execute script...')
      executeLocalScript()
      return
    }

    // If not executed yet, try to execute now
    if (tryExecuteLocalScript()) {
      return
    }

    // If can't execute (e.g., tab not ready), reload when active
    createReloadHandler('Local', () => !!GM_getValue(LOCAL_DEV_EVENT_KEY))
  }

  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    handleLocalDevModeUpdate(oldValue, newValue)
  })

  // EDITOR_DEV_EVENT_KEY listener is already set up early in main() function
}

main()
