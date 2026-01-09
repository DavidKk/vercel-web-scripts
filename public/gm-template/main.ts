/**
 * Main script for Tampermonkey user script
 * This file contains the core logic for executing scripts, dev mode, and rule management
 */

// Type declarations - these match stackblitz/typings.d.ts to avoid conflicts
// Injected variables (will be replaced at runtime)
declare const __BASE_URL__: string
// Used by rules.ts and other scripts - must be declared even if not used in this file
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const __RULE_API_URL__: string
declare const __RULE_MANAGER_URL__: string
declare const __EDITOR_URL__: string
declare const __HMK_URL__: string
declare const __SCRIPT_URL__: string
declare const __IS_DEVELOP_MODE__: boolean
declare const __HOSTNAME_PORT__: string
declare const __GRANTS_STRING__: string
declare const __IS_REMOTE_EXECUTE__: boolean

// GM_* function declarations (types from stackblitz/typings.d.ts)
declare function GM_getValue<T = any>(key: string, defaultValue?: T): T
declare function GM_setValue(key: string, value: any): void
declare function GM_addValueChangeListener(key: string, callback: (name: string, oldValue: any, newValue: any, remote: boolean) => void): string
declare function GM_registerMenuCommand(caption: string, commandFunc: () => void, accessKey?: string): number
declare function GM_unregisterMenuCommand(menuCmdId: number): void

const WEB_SCRIPT_ID = GME_uuid()
const IS_REMOTE_SCRIPT = typeof __IS_REMOTE_EXECUTE__ === 'boolean' && __IS_REMOTE_EXECUTE__
// Use window.location.host instead of hostname to include port number
const IS_DEVELOP_MODE = __IS_DEVELOP_MODE__ && __HOSTNAME_PORT__ === window.location.host

const LOCAL_DEV_EVENT_KEY = 'files@web-script-dev'
const EDITOR_DEV_EVENT_KEY = 'files@web-script-editor-dev'
const DEV_CHANNEL_NAME = 'web-script-dev'

/** BroadcastChannel for cross-tab communication */
let devChannel: BroadcastChannel | null = null

/**
 * Initialize BroadcastChannel for dev mode communication
 * @returns {BroadcastChannel} The BroadcastChannel instance
 */
function initDevChannel(): BroadcastChannel {
  if (!devChannel) {
    devChannel = new BroadcastChannel(DEV_CHANNEL_NAME)
  }
  return devChannel
}

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
 */
async function executeEditorScript(): Promise<void> {
  if (!isEditorDevMode()) {
    GME_info('[Editor Dev Mode] Editor dev mode not active, skipping execution')
    return
  }

  const host = getEditorDevHost()
  if (!host) {
    GME_info('[Editor Dev Mode] No editor dev mode host found, skipping execution')
    return
  }

  // Get files and compiled content from GM_setValue (like Local Dev Mode)
  const response = GM_getValue(EDITOR_DEV_EVENT_KEY) as { files?: Record<string, string>; compiledContent?: string } | null
  const files = response?.files || {}
  const compiledContent = response?.compiledContent

  if (Object.keys(files).length === 0) {
    GME_info('[Editor Dev Mode] No editor files found, skipping execution')
    return
  }

  GME_info('[Editor Dev Mode] Executing editor script, host: ' + host + ', file count: ' + Object.keys(files).length)

  try {
    // Compiled content is required - if not available, compilation failed on host side
    if (!compiledContent) {
      GME_fail('[Editor Dev Mode] No compiled content available. Compilation may have failed on editor side.')
      return
    }

    GME_ok('[Editor Dev Mode] Editor script ready, executing...')
    executeScript(compiledContent)
    GME_ok('[Editor Dev Mode] Editor script executed successfully')
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    GME_fail('[Editor Dev Mode] Failed to execute editor script: ' + errorMessage)
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
 * Try to execute local script if conditions are met
 * @returns {boolean} True if script was executed
 */
function tryExecuteLocalScript(): boolean {
  if (hasExecutedLocalScript || IS_REMOTE_SCRIPT) {
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
 * @returns {Promise<boolean>} True if script was executed
 */
async function tryExecuteEditorScript(): Promise<boolean> {
  if (hasExecutedEditorScript || IS_REMOTE_SCRIPT) {
    return false
  }

  if (isEditorDevMode()) {
    const host = getEditorDevHost()
    if (!host) {
      return false
    }

    // Check if this is the active host
    // We need to check by fetching from API or checking GM_getValue
    // For now, we'll allow any tab to execute if editor dev mode is active
    // The host check will be done in executeEditorScript
    hasExecutedEditorScript = true
    await executeEditorScript()
    return true
  }
  return false
}

/**
 * Main function that orchestrates script execution
 */
async function main(): Promise<void> {
  const channel = initDevChannel()

  // In development mode, clear any residual local/editor dev mode flags to ensure remote script execution
  if (IS_DEVELOP_MODE) {
    const hasLocalDevMode = isLocalDevMode()
    const hasEditorDevMode = isEditorDevMode()

    if (hasLocalDevMode) {
      GM_setValue(LOCAL_DEV_EVENT_KEY, null)
      GME_info('[Dev Mode] Cleared residual local dev mode flag')
    }

    if (hasEditorDevMode) {
      GM_setValue(EDITOR_DEV_EVENT_KEY, null)
      GME_info('[Dev Mode] Cleared residual editor dev mode flag')
    }
  }

  if (tryExecuteLocalScript()) {
    function handleLocalScriptUpdate(oldValue: any, newValue: any): void {
      if (!newValue) {
        return
      }

      if (oldValue?.lastModified >= newValue?.lastModified) {
        return
      }

      // Check if there are cached files (from host tab)
      const host = getLocalDevHost()
      if (!host) {
        return
      }

      // Re-execute script (works for both host and non-host tabs)
      GME_info('[Local Dev Mode] Local files updated, re-executing script...')
      executeLocalScript()
    }

    GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
      handleLocalScriptUpdate(oldValue, newValue)
    })

    channel.addEventListener('message', (event) => {
      const { type, host, lastModified } = event.data as {
        type: string
        host: string
        lastModified: number
      }

      if (type === 'files-updated' && host === WEB_SCRIPT_ID) {
        // HOST tab already executed GM_setValue, which will trigger GM_addValueChangeListener
        // This channel listener is for faster response, but we don't need to execute GM_setValue again
        // Just check if we need to handle the update immediately
        const currentState = GM_getValue(LOCAL_DEV_EVENT_KEY) as { lastModified?: number } | null
        if (currentState?.lastModified && currentState.lastModified >= lastModified) {
          return
        }

        // Wait for GM_addValueChangeListener to trigger (HOST tab already executed GM_setValue)
        // This is just for logging/debugging
        GME_info('Received files-updated message, waiting for GM_addValueChangeListener to trigger...')
      }
    })

    return
  }

  if (await tryExecuteEditorScript()) {
    function handleEditorScriptUpdate(oldValue: any, newValue: any): void {
      if (!newValue) {
        return
      }

      if (oldValue?.lastModified >= newValue?.lastModified) {
        return
      }

      const host = getEditorDevHost()
      if (!host) {
        return
      }

      GME_info('[Editor Dev Mode] Editor files updated, re-executing script...')
      executeEditorScript()
    }

    GM_addValueChangeListener(EDITOR_DEV_EVENT_KEY, (name, oldValue, newValue) => {
      handleEditorScriptUpdate(oldValue, newValue)
    })

    // Note: editor-files-updated messages are handled by the global channel listener below
    // The editor sends messages with host = 'editor-xxx', not WEB_SCRIPT_ID
    return
  }

  if (IS_DEVELOP_MODE && !IS_REMOTE_SCRIPT) {
    watchHMRUpdates({
      onUpdate: () => window.location.reload(),
    })

    GME_info('Development mode')
    executeRemoteScript()
    return
  }

  if (IS_REMOTE_SCRIPT) {
    GME_info('Executing remote script')
  }

  const rules = await fetchRulesFromCache()
  // Used by compiled scripts from createUserScript.server.ts
  // This function is called by dynamically compiled scripts, so it must be available globally
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function matchRule(name: string, url: string = window.location.href): boolean {
    return rules.some(({ wildcard, script }: { wildcard?: string; script?: string }) => {
      if (script !== name) {
        return false
      }

      return wildcard && matchUrl(wildcard, url)
    })
  }

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

  /**
   * Validate script by checking if it exists and can be accessed
   * Similar to editor's handleUpdate logic
   * @param scriptUrl Script URL to validate
   * @returns Object with isValid flag and the URL to use
   */
  async function validateScript(scriptUrl: string): Promise<{ isValid: boolean; url: string | null }> {
    try {
      GME_info('Validating script compilation...')

      // Extract key from script URL (e.g., /static/{key}/tampermonkey.js)
      const urlObj = new URL(scriptUrl, window.location.origin)
      const pathParts = urlObj.pathname.split('/')
      const keyIndex = pathParts.indexOf('static')
      if (keyIndex === -1 || keyIndex + 1 >= pathParts.length) {
        GME_fail('Invalid script URL format')
        GME_notification('Invalid script URL format', 'error')
        return { isValid: false, url: null }
      }

      const key = pathParts[keyIndex + 1]
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`
      const userUrl = `${baseUrl}/static/${key}/tampermonkey.user.js`
      const fallback = `${baseUrl}/static/${key}/tampermonkey.js`

      // Check if tampermonkey.user.js exists (HEAD request)
      try {
        const userResponse = await GME_fetch(userUrl, { method: 'HEAD' })
        if (userResponse.ok) {
          GME_ok('Script validation passed (tampermonkey.user.js found)')
          return { isValid: true, url: userUrl }
        }
      } catch (error) {
        // Continue to check fallback
      }

      // Check fallback tampermonkey.js
      try {
        const fallbackResponse = await GME_fetch(fallback, { method: 'HEAD' })
        if (fallbackResponse.ok) {
          GME_ok('Script validation passed (tampermonkey.js found)')
          return { isValid: true, url: fallback }
        }
      } catch (error) {
        // Both failed
      }

      // Both URLs failed - compilation may have failed
      GME_fail('Script validation failed: Both tampermonkey.user.js and tampermonkey.js are not available')
      GME_fail('This usually means script compilation failed. Please check for errors.')
      GME_notification('Script compilation failed. Please check for errors in the editor.', 'error', 5000)
      return { isValid: false, url: null }
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      GME_fail(`Script validation failed: ${errorMessage}`)
      GME_notification(`Script validation failed: ${errorMessage}`, 'error', 5000)
      return { isValid: false, url: null }
    }
  }

  GM_registerMenuCommand('Update Script', async () => {
    const scriptUrl = __SCRIPT_URL__
    if (!scriptUrl) {
      GME_fail('Script URL is not available')
      GME_notification('Script URL is not available', 'error')
      return
    }

    const validation = await validateScript(scriptUrl)
    if (!validation.isValid || !validation.url) {
      GME_fail('Script validation failed. Update cancelled.')
      return
    }

    GME_ok('Opening update link...')
    window.open(validation.url, '_blank', 'noopener')
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
          GM_setValue(EDITOR_DEV_EVENT_KEY, null)

          // Notify other tabs via BroadcastChannel
          channel.postMessage({
            type: 'editor-dev-mode-stopped',
            host: host,
          })

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
          GM_setValue(LOCAL_DEV_EVENT_KEY, state)

          if (hasModified) {
            // Use channel from outer scope (main function)
            channel.postMessage({ type: 'files-updated', host: WEB_SCRIPT_ID, lastModified, files, compiledContent })
            GME_info('[Local Dev Mode] Local files modified, emitting reload event...')
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

  function handleEditorDevModeUpdate(oldValue: any, newValue: any): void {
    // Handle editor dev mode stopped (newValue is null)
    if (!newValue) {
      // If this tab was using editor dev mode, reload to go back to normal mode
      if (hasExecutedEditorScript) {
        GME_info('Editor dev mode stopped, reloading to return to normal mode...')
        // Reset the flag so it doesn't try to execute editor script again
        hasExecutedEditorScript = false
        window.location.reload()
      }
      return
    }

    // Skip if current page is the editor page (editor page shouldn't reload itself)
    if (window.location.pathname.includes('/tampermonkey/editor')) {
      GME_info('Current page is editor page, skipping update')
      return
    }

    if (oldValue?.lastModified >= newValue?.lastModified) {
      GME_info('No update needed, old lastModified: ' + oldValue.lastModified + ', new: ' + newValue.lastModified)
      return
    }

    const activeHost = getEditorDevHost()
    if (!activeHost) {
      GME_info('No active editor dev mode host, skipping update')
      return
    }

    if (newValue.host !== activeHost) {
      GME_info('Host mismatch, active: ' + activeHost + ', received: ' + newValue.host + ', skipping update')
      return
    }

    // Only trigger reload/re-execute when tab is active to avoid excessive reloads
    const isTabActive = !document.hidden && document.hasFocus()

    if (!isTabActive) {
      GME_info('[Editor Dev Mode] Editor files updated, but tab is not active. Will reload when tab becomes active...')

      // Wait for tab to become active before reloading
      const onTabActive = (): void => {
        if (document.hidden || !document.hasFocus()) {
          return
        }

        // Remove listeners
        document.removeEventListener('visibilitychange', onTabActive)
        window.removeEventListener('focus', onTabActive)

        // Check if dev mode is still active
        const currentDevMode = GM_getValue(EDITOR_DEV_EVENT_KEY)
        if (!currentDevMode) {
          GME_info('Editor dev mode stopped while waiting for tab to be active. Reloading to return to normal mode...')
          hasExecutedEditorScript = false
          window.location.reload()
          return
        }

        // Now trigger reload or re-execute based on whether script was already executed
        if (hasExecutedEditorScript) {
          GME_info('[Editor Dev Mode] Editor files updated, re-executing script (tab now active)...')
          executeEditorScript()
        } else {
          GME_info('[Editor Dev Mode] Editor dev mode detected, reloading (tab now active)...')
          window.location.reload()
        }
      }

      document.addEventListener('visibilitychange', onTabActive)
      window.addEventListener('focus', onTabActive)
      return
    }

    // Tab is active, proceed with reload or re-execute
    if (hasExecutedEditorScript) {
      GME_info('[Editor Dev Mode] Editor files updated, re-executing script...')
      executeEditorScript()
      return
    }

    // For tabs that haven't executed the script yet, reload to load the new script
    GME_info('[Editor Dev Mode] Editor dev mode detected, reloading...')
    window.location.reload()
  }

  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    handleLocalDevModeUpdate(oldValue, newValue)
  })

  GM_addValueChangeListener(EDITOR_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    handleEditorDevModeUpdate(oldValue, newValue)
  })

  channel.addEventListener('message', (event) => {
    // Skip local dev mode messages if local dev mode is active (isDevMode is only set for local dev mode)
    // Editor dev mode messages should still be processed
    const { type, host, lastModified, files } = event.data as {
      type: string
      host: string
      lastModified: number
      files: Record<string, string>
    }

    if (isDevMode && type === 'files-updated') {
      return
    }

    if (type === 'files-updated' && host === WEB_SCRIPT_ID) {
      // HOST tab already executed GM_setValue, which will trigger GM_addValueChangeListener in all tabs
      // Other tabs don't need to execute GM_setValue again, they will receive notification via GM_addValueChangeListener
      // This channel listener is only for logging/debugging purposes
      const currentState = GM_getValue(LOCAL_DEV_EVENT_KEY) as { lastModified?: number } | null
      if (currentState?.lastModified && currentState.lastModified >= lastModified) {
        return
      }

      // Only log, don't execute GM_setValue (HOST tab already did it)
      GME_info('Received files-updated message from HOST, waiting for GM_addValueChangeListener to trigger...')
    }

    if (type === 'editor-dev-mode-started') {
      GME_info('Editor dev mode started, host: ' + host)

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

      // Wait for files to be sent via editor-files-updated message
      GME_info('Editor dev mode activated, waiting for files...')
    }

    if (type === 'editor-dev-mode-stopped') {
      GME_info('Editor dev mode stopped, host: ' + host)
      // Editor dev mode stopped, clear the key
      // Note: We clear even if host doesn't match, in case of race conditions
      const currentHost = getEditorDevHost()
      if (!currentHost || currentHost === host) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_info('Editor dev mode cleared')
      } else {
        GME_info('Host mismatch on stop, current: ' + currentHost + ', stopped: ' + host + ', keeping current host')
      }
    }

    if (type === 'editor-files-updated') {
      const compiledContent = (event.data as { compiledContent?: string }).compiledContent
      GME_info(
        'Received editor-files-updated message, host: ' +
          host +
          ', lastModified: ' +
          lastModified +
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

      // Check if current tab is the editor tab (only editor tab should execute GM_setValue)
      const isEditorTab = window.location.pathname.includes('/tampermonkey/editor')

      if (!isEditorTab) {
        // Other tabs don't need to execute GM_setValue, they will receive notification via GM_addValueChangeListener
        GME_info('Not editor tab, waiting for GM_addValueChangeListener to trigger...')
        return
      }

      // Only editor tab executes GM_setValue (like HOST tab in Local Dev Mode)
      const currentState = GM_getValue(EDITOR_DEV_EVENT_KEY) as { lastModified?: number } | null
      if (currentState?.lastModified && currentState.lastModified >= lastModified) {
        GME_info('No update needed, current lastModified: ' + currentState.lastModified + ', received: ' + lastModified)
        return
      }

      const newValue = { host, lastModified, files, compiledContent }
      GM_setValue(EDITOR_DEV_EVENT_KEY, newValue)
      GME_info('Editor dev mode files stored by editor tab, host: ' + host + ', file count: ' + Object.keys(files).length + ', hasCompiledContent: ' + !!compiledContent)
      // GM_setValue will automatically trigger GM_addValueChangeListener in all tabs (including this one)
    }
  })
}

main()
