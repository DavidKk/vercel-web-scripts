/**
 * Main entry point for Tampermonkey script.
 * Orchestrates services only; logic lives in helpers and services.
 */

import { PRESET_PROJECT_VERSION_KEY } from '@shared/launcher-constants'
import { waitForPresetCoreInjectionReady } from '@shared/preset-core-injection-gate'

import { shouldSkipNonHtmlDocument } from '@/helpers/dom'
import { detectDevelopModePresence, ensureWebScriptInitialized, getWebScriptId, isDevelopMode, isRemoteScript } from '@/helpers/env'
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
import { ensureOptionalUi } from '@/services/optional-ui'
import { flushPassiveOtaUpdatePending } from '@/services/ota-passive-update'
import { logAndClearPresetUpdatedNotify, subscribePresetBuiltSSE } from '@/services/preset-built-sse'
import { executeRemoteScript, watchHMRUpdates } from '@/services/script-execution'
import { getScriptUpdate, pushScriptUpdateToOpenTabs, setupScriptUpdatePushListener } from '@/services/script-update'
import { flushScriptUpdatePushPending } from '@/services/script-update-push'
import { isShellNetworkEnabled } from '@/services/shell-network-settings'

const WEB_SCRIPT_ID = getWebScriptId()
ensureWebScriptInitialized(WEB_SCRIPT_ID)
const ACTIVE_DEV_SCRIPT_KEY = 'vws_active_dev_script_presence'
const ACTIVE_DEV_SCRIPT_TTL_MS = 15_000

interface ActiveDevScriptPresence {
  host: string
  ts: number
}

/**
 * Persist preset project version for extension popup / diagnostics (scoped + legacy GM keys).
 * @param version Project version baked into preset at build time
 */
function persistPresetProjectVersion(version: string): void {
  if (!version || version === 'unknown') {
    return
  }
  try {
    const baseUrl = typeof __BASE_URL__ !== 'undefined' ? String(__BASE_URL__).replace(/\/+$/, '') : ''
    const scriptUrl = typeof __SCRIPT_URL__ !== 'undefined' ? String(__SCRIPT_URL__) : ''
    const keyMatch = scriptUrl.match(/\/static\/([^/]+)\//)
    const scriptKey = keyMatch?.[1] ?? ''
    if (baseUrl && scriptKey) {
      const scope = encodeURIComponent(`${baseUrl}|${scriptKey}`)
      GM_setValue(`${PRESET_PROJECT_VERSION_KEY}:${scope}`, version)
    }
    GM_setValue(PRESET_PROJECT_VERSION_KEY, version)
  } catch {
    // ignore persistence errors
  }
}

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
  if (shouldSkipNonHtmlDocument()) {
    GME_debug('[Main] Non-HTML document (contentType: ' + (typeof document !== 'undefined' ? document.contentType : 'n/a') + '), skipping preset')
    return
  }
  const staticDevelopMode = isDevelopMode()
  // Effective dev mode requires BOTH:
  // 1) static dev compilation (Web Script (dev))
  // 2) runtime dev service presence (pnpm dev online)
  const runtimeDevelopMode = staticDevelopMode ? await detectDevelopModePresence() : false
  const IS_DEVELOP_MODE = staticDevelopMode && runtimeDevelopMode
  const IS_REMOTE_SCRIPT = isRemoteScript()

  const projectVersion = typeof __PROJECT_VERSION__ !== 'undefined' && __PROJECT_VERSION__ ? __PROJECT_VERSION__ : 'unknown'
  const updateTimeStamp = typeof __SCRIPT_UPDATED_AT__ !== 'undefined' && __SCRIPT_UPDATED_AT__ ? __SCRIPT_UPDATED_AT__ : ''
  const updateTimeMs = updateTimeStamp ? Number(updateTimeStamp) : 0
  const updateTime = updateTimeMs > 0 && Number.isFinite(updateTimeMs) ? new Date(updateTimeMs).toLocaleString() : 'unknown'
  const updateTimeHint = updateTime === 'unknown' ? ' (preset may be cached; publish from editor or use Update Script to refresh)' : ''
  GME_info('[Main] Project version: ' + projectVersion + ', Update time: ' + updateTime + updateTimeHint + ', preset build: ' + __PRESET_BUILD_HASH__)
  persistPresetProjectVersion(projectVersion)
  GME_debug('[Main] Logger online — earlier [VWS][Launcher] lines were captured as [boot] in the log viewer (same timeline timestamps as console)')
  GME_debug(
    '[Main] Starting main, IS_DEVELOP_MODE: ' +
      IS_DEVELOP_MODE +
      ' (static: ' +
      staticDevelopMode +
      ', runtime-probe: ' +
      runtimeDevelopMode +
      '), IS_REMOTE_SCRIPT: ' +
      IS_REMOTE_SCRIPT
  )

  const now = Date.now()
  const activeDevPresence = GM_getValue(ACTIVE_DEV_SCRIPT_KEY, null) as ActiveDevScriptPresence | null
  const hasActiveDevPresence = !!activeDevPresence && typeof activeDevPresence.ts === 'number' && now - activeDevPresence.ts < ACTIVE_DEV_SCRIPT_TTL_MS

  // "Web Script (dev)" should be active only when dev service is reachable.
  if (staticDevelopMode && !IS_DEVELOP_MODE) {
    GM_setValue(ACTIVE_DEV_SCRIPT_KEY, null)
    GME_debug('[Main] Dev script idle: dev service unavailable, skip execution')
    return
  }

  // "Web Script" should step aside while "Web Script (dev)" is active.
  if (!staticDevelopMode && hasActiveDevPresence) {
    GME_debug('[Main] Prod script skipped: active dev script presence detected')
    return
  }

  if (staticDevelopMode && IS_DEVELOP_MODE) {
    GM_setValue(ACTIVE_DEV_SCRIPT_KEY, {
      host: window.location.host,
      ts: now,
    } satisfies ActiveDevScriptPresence)
  }

  if (IS_DEVELOP_MODE && isShellNetworkEnabled()) {
    subscribePresetBuiltSSE(__BASE_URL__)
  }
  logAndClearPresetUpdatedNotify()

  // Legacy helper URL: strip param and push in-place script update (no page reload).
  if (typeof window !== 'undefined' && window.location.search.includes('vws_script_update=1')) {
    try {
      const u = new URL(window.location.href)
      u.searchParams.delete('vws_script_update')
      history.replaceState(null, '', u.toString())
    } catch (e) {
      GME_fail('[Main] replaceState failed:', e instanceof Error ? e.message : String(e))
    }
    pushScriptUpdateToOpenTabs()
  }

  setupScriptUpdatePushListener()
  flushPassiveOtaUpdatePending()
  flushScriptUpdatePushPending()

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
    registerBasicMenus()
    GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
      handleLocalDevModeUpdate(oldValue, newValue, false)
    })
    void ensureOptionalUi()
    return
  }

  const editorScriptResult = await tryExecuteEditorScript()
  if (editorScriptResult) {
    registerBasicMenus()
    void ensureOptionalUi()
    return
  }

  GME_debug('[Main] After editor script check, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)
  if (IS_DEVELOP_MODE && !IS_REMOTE_SCRIPT) {
    GME_debug('[Main] Entering dev mode path')
    registerBasicMenus()
    if (isEditorPage()) {
      GME_debug('[Dev Mode] Current page is editor page (HOST), skipping remote script execution')
      getScriptUpdate()
      void ensureOptionalUi()
      return
    }
    GME_debug('[Main] Non-editor page in dev mode, initializing services and executing remote script')
    getScriptUpdate()
    if (isShellNetworkEnabled()) {
      watchHMRUpdates({ onUpdate: () => window.location.reload() })
    }
    GME_info('Development mode')
    executeRemoteScript()
    void ensureOptionalUi()
    return
  }

  GME_debug('[Main] Not in dev mode path, IS_DEVELOP_MODE: ' + IS_DEVELOP_MODE + ', IS_REMOTE_SCRIPT: ' + IS_REMOTE_SCRIPT)
  if (IS_REMOTE_SCRIPT) {
    GME_debug('[Main] IS_REMOTE_SCRIPT=true, executing remote script')
  }

  GME_debug('[Main] Fetching rules and setting up matchRule function')
  const rules = await fetchRulesFromCache()
  setGlobalRules(rules)
  GME_debug(`[Main] Rules active count=${rules.length} url=${typeof window !== 'undefined' ? window.location.href.slice(0, 120) : '(n/a)'}`)

  function executeGistScripts(): void {
    // @ts-expect-error - Placeholder will be replaced with actual GIST scripts code at runtime
    __GIST_SCRIPTS_PLACEHOLDER__
  }

  if (typeof __INLINE_GIST__ !== 'undefined' && __INLINE_GIST__) {
    executeGistScripts()
  } else {
    await waitForPresetCoreInjectionReady()
    await executeRemoteScript()
  }

  registerBasicMenus()
  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    handleLocalDevModeUpdate(oldValue, newValue, false)
  })

  // After preset-core MAIN-world injection completes (main yielded on first await above).
  // Cache-first preset-ui must not overlap preset-core userScripts.execute on strict CSP (GitHub).
  void ensureOptionalUi()
}

main()
