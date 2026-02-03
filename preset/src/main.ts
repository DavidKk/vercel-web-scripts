/**
 * Main entry point for Tampermonkey script.
 * Orchestrates services only; logic lives in helpers and services.
 */

import { PRESET_CACHE_KEY } from '@/constants'
import { ensureWebScriptInitialized, getWebScriptId, isDevelopMode, isRemoteScript } from '@/helpers/env'
import { GME_debug, GME_fail, GME_info } from '@/helpers/logger'
import { fetchRulesFromCache, getMatchRule, setGlobalRules } from '@/rules'
import {
  EDITOR_DEV_EVENT_KEY,
  getEditorDevHost,
  getLocalDevHost,
  handleEditorDevModeUpdate,
  handleLocalDevModeUpdate,
  isEditorDevMode,
  isEditorPage,
  isLocalDevMode,
  LOCAL_DEV_EVENT_KEY,
  setupEditorPostMessageListener,
  tryExecuteEditorScript,
  tryExecuteLocalScript,
} from '@/services/dev-mode'
import { registerBasicMenus } from '@/services/menu'
import { logAndClearPresetUpdatedNotify, subscribePresetBuiltSSE } from '@/services/preset-built-sse'
import { executeRemoteScript, watchHMRUpdates } from '@/services/script-execution'
import { getScriptUpdate } from '@/services/script-update'

const WEB_SCRIPT_ID = getWebScriptId()
ensureWebScriptInitialized(WEB_SCRIPT_ID)

/**
 * Get the shared global object for preset and remote script (launcher's g or globalThis/window).
 * @returns Global object to attach matchRule etc.
 */
function getPresetGlobal(): typeof globalThis & { matchRule?: (name: string, url?: string) => boolean } {
  if (typeof __GLOBAL__ !== 'undefined') return __GLOBAL__
  if (typeof globalThis !== 'undefined') return globalThis
  if (typeof window !== 'undefined') return window
  return {} as any
}

/**
 * Expose matchRule on the preset global so GIST/remote script can resolve it.
 */
function exposeMatchRule(): void {
  const g = getPresetGlobal()
  ;(g as any).matchRule = getMatchRule()
}

/**
 * Main: orchestrate script execution (local dev → editor dev → dev mode remote → fetch rules → GIST/remote).
 */
async function main(): Promise<void> {
  const IS_DEVELOP_MODE = isDevelopMode()
  const IS_REMOTE_SCRIPT = isRemoteScript()

  const projectVersion = typeof __PROJECT_VERSION__ !== 'undefined' && __PROJECT_VERSION__ ? __PROJECT_VERSION__ : 'unknown'
  const updateTimeStamp = typeof __SCRIPT_UPDATED_AT__ !== 'undefined' && __SCRIPT_UPDATED_AT__ ? __SCRIPT_UPDATED_AT__ : ''
  const updateTimeMs = updateTimeStamp ? Number(updateTimeStamp) : 0
  const updateTime = updateTimeMs > 0 && Number.isFinite(updateTimeMs) ? new Date(updateTimeMs).toLocaleString() : 'unknown'
  const updateTimeHint = updateTime === 'unknown' ? ' (preset may be cached; add ?vws_script_update=1 and reload to refresh)' : ''
  GME_info('[Main] Project version: ' + projectVersion + ', Update time: ' + updateTime + updateTimeHint + ', preset build: ' + __PRESET_BUILD_HASH__)
  GME_debug('[Main] Starting main, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)

  subscribePresetBuiltSSE(__BASE_URL__)
  logAndClearPresetUpdatedNotify()

  // vws_script_update=1: clear preset cache and reload so launcher fetches fresh preset (e.g. after editor publish)
  if (typeof window !== 'undefined' && window.location.search.includes('vws_script_update=1')) {
    try {
      const u = new URL(window.location.href)
      u.searchParams.delete('vws_script_update')
      history.replaceState(null, '', u.toString())
    } catch (e) {
      GME_fail('[Main] replaceState failed:', e instanceof Error ? e.message : String(e))
    }
    GM_deleteValue(PRESET_CACHE_KEY)
    window.location.reload()
    return
  }

  exposeMatchRule()

  // Only register listener once per tab (skip when re-entered from executeEditorScript); otherwise each re-execution adds another listener and one GM_setValue triggers all of them
  if (!IS_REMOTE_SCRIPT) {
    GM_addValueChangeListener(EDITOR_DEV_EVENT_KEY, (name, oldValue, newValue) => {
      handleEditorDevModeUpdate(oldValue, newValue)
    })
    GME_debug('[Main] GM_addValueChangeListener for EDITOR_DEV_EVENT_KEY set up early')
  }

  const existingEditorDevMode = GM_getValue(EDITOR_DEV_EVENT_KEY)
  // Skip when main re-entered from executeEditorScript (IS_REMOTE_SCRIPT): listener already handled the update; avoid duplicate "Processing update" and re-execution
  if (existingEditorDevMode && !IS_REMOTE_SCRIPT) {
    GME_debug('[Main] Editor dev mode already active when script loaded, processing existing value')
    handleEditorDevModeUpdate(null, existingEditorDevMode)
  }

  setupEditorPostMessageListener()

  const hasLocalDevMode = isLocalDevMode()
  const hasEditorDevMode = isEditorDevMode()

  if (IS_DEVELOP_MODE) {
    if (hasLocalDevMode && !getLocalDevHost()) {
      GM_setValue(LOCAL_DEV_EVENT_KEY, null)
      GME_debug('[Dev Mode] Cleared residual local dev mode flag (no active host)')
    }
    if (hasEditorDevMode) {
      const editorHost = getEditorDevHost()
      if (!editorHost) {
        GM_setValue(EDITOR_DEV_EVENT_KEY, null)
        GME_debug('[Dev Mode] Cleared residual editor dev mode flag (no active host)')
      } else {
        GME_debug('[Dev Mode] Editor dev mode has active host: ' + editorHost + ', keeping flag')
      }
    }
  } else if (hasEditorDevMode) {
    const editorHost = getEditorDevHost()
    if (!editorHost) {
      GM_setValue(EDITOR_DEV_EVENT_KEY, null)
      GME_debug('[Editor Dev Mode] Cleared residual editor dev mode flag (no active host)')
    } else {
      GME_debug('[Editor Dev Mode] Editor dev mode has active host in production mode: ' + editorHost)
    }
  }

  if (IS_DEVELOP_MODE && tryExecuteLocalScript(IS_REMOTE_SCRIPT)) {
    GME_debug('[Main] Local dev mode active, executing local script once (updates will reload only)')
    GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
      handleLocalDevModeUpdate(oldValue, newValue, false)
    })
    return
  }

  const editorScriptResult = await tryExecuteEditorScript()
  if (editorScriptResult) {
    return
  }

  GME_debug('[Main] After editor script check, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)
  if (IS_DEVELOP_MODE && !IS_REMOTE_SCRIPT) {
    GME_debug('[Main] Entering dev mode path')
    if (isEditorPage()) {
      GME_debug('[Dev Mode] Current page is editor page (HOST), skipping remote script execution')
      getScriptUpdate()
      return
    }
    GME_debug('[Main] Non-editor page in dev mode, initializing services and executing remote script')
    getScriptUpdate()
    watchHMRUpdates({ onUpdate: () => window.location.reload() })
    GME_info('Development mode')
    executeRemoteScript()
    return
  }

  GME_debug('[Main] Not in dev mode path, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)
  if (IS_REMOTE_SCRIPT) {
    GME_debug('[Main] IS_REMOTE_SCRIPT=true, executing remote script')
  }

  GME_debug('[Main] Fetching rules and setting up matchRule function')
  const rules = await fetchRulesFromCache()
  setGlobalRules(rules)
  GME_debug('[Main] Rules fetched, count: ' + rules.length)

  function executeGistScripts(): void {
    // @ts-expect-error - Placeholder will be replaced with actual GIST scripts code at runtime
    __GIST_SCRIPTS_PLACEHOLDER__
  }

  if (typeof __INLINE_GIST__ !== 'undefined' && __INLINE_GIST__) {
    executeGistScripts()
  } else {
    executeRemoteScript()
  }

  registerBasicMenus()
  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    handleLocalDevModeUpdate(oldValue, newValue, false)
  })
}

main()
