/**
 * Local dev mode handling
 */

/**
 * Track if local script has been executed
 */
let hasExecutedLocalScript = false

/**
 * Get whether local script has been executed
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getHasExecutedLocalScript(): boolean {
  return hasExecutedLocalScript
}

/**
 * Set whether local script has been executed
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function setHasExecutedLocalScript(value: boolean): void {
  hasExecutedLocalScript = value
}

/**
 * Try to execute local script if conditions are met
 * @param isRemoteScript Whether this is a remote script execution
 * @returns True if script was executed
 */
function tryExecuteLocalScript(isRemoteScript: boolean): boolean {
  if (hasExecutedLocalScript || isRemoteScript) {
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
 * Create a reload handler with waiting for tab to be active
 * @param modeName Name of the dev mode (for logging)
 * @param checkDevMode Function to check if dev mode is still active
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

/**
 * Handle local dev mode updates from GM_addValueChangeListener
 * @param oldValue Previous value
 * @param newValue New value
 * @param isDevMode Whether this tab is the dev mode host
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handleLocalDevModeUpdate(oldValue: any, newValue: any, isDevMode: boolean): void {
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
  if (tryExecuteLocalScript(false)) {
    return
  }

  // If can't execute (e.g., tab not ready), reload when active
  createReloadHandler('Local', () => !!GM_getValue(LOCAL_DEV_EVENT_KEY))
}

/**
 * Register Watch Local Files menu
 * @param webScriptId Web script ID for local dev mode check
 * @returns Function to unregister the menu listener
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerWatchLocalFilesMenu(webScriptId: string): () => void {
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
        if (host === webScriptId) {
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

        const state = { host: webScriptId, lastModified, files, compiledContent }
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
  const listenerId = GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, () => {
    registerWatchLocalFilesMenu()
  })

  // Return cleanup function
  return () => {
    GM_removeValueChangeListener(listenerId)
  }
}
