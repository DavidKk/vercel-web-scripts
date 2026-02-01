/**
 * Main entry point for Tampermonkey script
 */

import { GME_info } from './helpers/logger'
import { GME_uuid } from './helpers/utils'
import { fetchRulesFromCache, matchUrl } from './rules'
import { EDITOR_DEV_EVENT_KEY, getEditorDevHost, getLocalDevHost, isEditorDevMode, isLocalDevMode, LOCAL_DEV_EVENT_KEY } from './services/dev-mode'
import { getHasExecutedEditorScript, handleEditorDevModeUpdate, setHasExecutedEditorScript, setupEditorPostMessageListener } from './services/editor-dev-mode'
import { handleLocalDevModeUpdate, registerWatchLocalFilesMenu, tryExecuteLocalScript } from './services/local-dev-mode'
import { registerBasicMenus } from './services/menu'
import { executeEditorScript, executeLocalScript, executeRemoteScript, watchHMRUpdates } from './services/script-execution'
import { getScriptUpdate } from './services/script-update'

const WEB_SCRIPT_ID = GME_uuid()
const IS_REMOTE_SCRIPT = typeof __IS_REMOTE_EXECUTE__ === 'boolean' && __IS_REMOTE_EXECUTE__
// Use window.location.host instead of hostname to include port number
const IS_DEVELOP_MODE = __IS_DEVELOP_MODE__ && __HOSTNAME_PORT__ === window.location.host

/** GM_setValue key for preset update push (must match launcherScript.PRESET_UPDATE_CHANNEL_KEY) */
const PRESET_UPDATE_CHANNEL_KEY = 'vws_preset_update'

// Guard against multiple initializations
if ((window as any).__WEB_SCRIPT_INITIALIZED__) {
  GME_info('[Main] Loader already running, skipping initialization')
  // We return empty string or null to satisfy callers if needed, but here it's top-level
} else {
  ;(window as any).__WEB_SCRIPT_INITIALIZED__ = WEB_SCRIPT_ID
}

/**
 * Global rules cache for matchRule function
 * Updated in main() function after fetching rules
 */
let globalRules: Array<{ wildcard?: string; script?: string }> = []

/**
 * Match rule function for dynamically compiled scripts
 * This function is called by dynamically compiled scripts from createUserScript.server.ts
 * Must be available globally, so defined outside main() function
 * @param name Script name to match
 * @param url URL to match against (defaults to current page URL)
 * @returns True if rule matches
 */
function matchRule(name: string, url: string = window.location.href): boolean {
  return globalRules.some(({ wildcard, script }) => {
    if (script !== name) {
      return false
    }

    return wildcard && matchUrl(wildcard, url)
  })
}

/**
 * Try to execute editor script if conditions are met
 * @returns Promise that resolves to true if script was executed or if editor dev mode is active (to prevent remote script execution)
 */
async function tryExecuteEditorScript(): Promise<boolean> {
  if (getHasExecutedEditorScript() || IS_REMOTE_SCRIPT) {
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
      setHasExecutedEditorScript(true)
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
 * Subscribe to dev server SSE for preset rebuild; on preset-built event, push to Launcher so it clears cache and reloads.
 * Used by both editor page and non-editor dev pages so preset update is received when only editor is open.
 */
function subscribePresetBuiltSSE(): void {
  try {
    const url = `${__BASE_URL__}/api/sse/preset-built`
    const es = new EventSource(url)
    es.onopen = () => {
      GME_info('[preset-built] SSE connected: ' + url)
    }
    es.addEventListener('preset-built', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { builtAt?: number }
        const builtAt = typeof data?.builtAt === 'number' ? data.builtAt : Date.now()
        GME_info('[preset-built] event received builtAt=' + builtAt + ', pushing to Launcher')
        GM_setValue(PRESET_UPDATE_CHANNEL_KEY, builtAt)
        GME_info('[Dev] Preset rebuild pushed via SSE, Launcher will reload')
      } catch {
        // ignore parse error
      }
    })
  } catch {
    // Dev server may not be reachable (e.g. production build)
  }
}

/**
 * Main function that orchestrates script execution
 */
async function main(): Promise<void> {
  GME_info('[Main] Starting main function, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)

  // Trigger script update push when opened with ?vws_script_update=1 (e.g. after editor publish)
  if (typeof window !== 'undefined' && window.location.search.includes('vws_script_update=1')) {
    try {
      const u = new URL(window.location.href)
      u.searchParams.delete('vws_script_update')
      history.replaceState(null, '', u.toString())
    } catch {
      // ignore
    }
    await getScriptUpdate().update()
    return
  }

  // Expose matchRule on shared global early so remote/editor/local script can resolve it in all code paths
  // (dev path calls executeRemoteScript without fetching rules; normal path sets it again after fetch)
  const g = typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any)
  ;(g as any).matchRule = matchRule

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

  // Set up window.postMessage listener for Editor page
  setupEditorPostMessageListener()

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
  if (IS_DEVELOP_MODE && tryExecuteLocalScript(IS_REMOTE_SCRIPT)) {
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
      getScriptUpdate()
      // Subscribe to preset-built SSE so when only editor is open, we still receive and push to Launcher
      subscribePresetBuiltSSE()
      return
    }

    GME_info('[Main] Non-editor page in dev mode, initializing services and executing remote script')
    // Initialize script-update service to listen for update messages
    getScriptUpdate()

    watchHMRUpdates({
      onUpdate: () => window.location.reload(),
    })

    subscribePresetBuiltSSE()

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
  // matchRule already on g from start of main(); globalRules now updated so matchRule() resolves correctly

  /**
   * Execute GIST compiled scripts
   * This function body will be replaced with actual GIST scripts code at compile time (full bundle).
   * When preset is loaded by launcher (__INLINE_GIST__ undefined), we fetch and run remote script from __SCRIPT_URL__ instead.
   */
  function executeGistScripts(): void {
    // @ts-expect-error - Placeholder will be replaced with actual GIST scripts code at runtime
    __GIST_SCRIPTS_PLACEHOLDER__
  }

  if (typeof __INLINE_GIST__ !== 'undefined' && __INLINE_GIST__) {
    executeGistScripts()
  } else {
    executeRemoteScript()
  }

  // Register basic menus
  registerBasicMenus(WEB_SCRIPT_ID)

  // Register Watch Local Files menu
  registerWatchLocalFilesMenu(WEB_SCRIPT_ID)

  // Set up local dev mode update listener
  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    // Check if this tab is the dev mode host (isDevMode would be true if it started the watch)
    // For now, we'll pass false as we don't have easy access to that state here
    // The handleLocalDevModeUpdate function will handle the logic
    handleLocalDevModeUpdate(oldValue, newValue, false)
  })

  // EDITOR_DEV_EVENT_KEY listener is already set up early in main() function
}

main()
