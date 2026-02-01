/**
 * Global Registry Service
 *
 * Single source of truth for registering preset APIs onto globalThis.
 * Ensures both main.ts (no imports) and external GIST scripts can access
 * required functions after the preset IIFE bundle runs.
 *
 * Must be loaded after all helpers, services, and UI modules and before main.
 */

import * as dom from '../helpers/dom'
import * as http from '../helpers/http'
import * as logger from '../helpers/logger'
import * as utils from '../helpers/utils'
import { fetchAndCacheRules, fetchRulesFromCache, matchUrl } from '../rules'
import { fetchCompileScript, fetchScript, loadScript } from '../scripts'
import { GME_registerMenuCommand, GME_updateMenuCommand } from '../ui/corner-widget/index'
import { GME_openLogViewer } from '../ui/log-viewer/index'
import {
  GME_areMarksHidden,
  GME_cleanupInvalidMarks,
  GME_clearAllMarks,
  GME_clearSelection,
  GME_disableNodeSelector,
  GME_enableNodeSelector,
  GME_getMarkedNodes,
  GME_getSelectedNode,
  GME_hideMarks,
  GME_markNode,
  GME_showMarks,
  GME_unmarkNode,
} from '../ui/node-selector/index'
import { GME_notification as GME_notificationUI } from '../ui/notification/index'
import { GME_openSpotlight, GME_registerSpotlightCommand } from '../ui/spotlight/index'
import { EDITOR_DEV_EVENT_KEY, getActiveDevMode, getEditorDevHost, getLocalDevHost, isEditorDevMode, isLocalDevMode, LOCAL_DEV_EVENT_KEY } from './dev-mode'
import { getHasExecutedEditorScript, handleEditorDevModeUpdate, setHasExecutedEditorScript, setupEditorPostMessageListener } from './editor-dev-mode'
import { handleLocalDevModeUpdate, registerWatchLocalFilesMenu, tryExecuteLocalScript } from './local-dev-mode'
import { logStore } from './log-store'
import { registerBasicMenus } from './menu'
import { executeEditorScript, executeLocalScript, executeRemoteScript, watchHMRUpdates } from './script-execution'
import { getScriptUpdate } from './script-update'
import { getTabCommunication } from './tab-communication'

/**
 * Register all preset APIs onto globalThis.
 * Called once at preset load; main.ts and GIST scripts rely on these globals.
 */
export function registerGlobals(): void {
  const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any)

  Object.assign(g, {
    // Helpers (public API for GIST scripts)
    ...utils,
    ...http,
    ...logger,
    ...dom,
    logStore,

    // Script loading (used by script-execution, local-dev-mode, script-update)
    fetchScript,
    fetchCompileScript,
    loadScript,

    // UI public API (GIST scripts)
    GME_openLogViewer,
    GME_notification: GME_notificationUI,
    GME_openSpotlight,
    GME_registerSpotlightCommand,
    GME_registerMenuCommand,
    GME_updateMenuCommand,
    GME_enableNodeSelector,
    GME_disableNodeSelector,
    GME_getSelectedNode,
    GME_clearSelection,
    GME_markNode,
    GME_unmarkNode,
    GME_clearAllMarks,
    GME_getMarkedNodes,
    GME_cleanupInvalidMarks,
    GME_hideMarks,
    GME_showMarks,
    GME_areMarksHidden,
    registerBasicMenus,

    // Rules (main.ts + matchRule; GIST may use matchUrl via matchRule)
    matchUrl,
    fetchAndCacheRules,
    fetchRulesFromCache,

    // Editor dev mode (main.ts)
    getHasExecutedEditorScript,
    setHasExecutedEditorScript,
    handleEditorDevModeUpdate,
    setupEditorPostMessageListener,
    executeEditorScript,
    executeRemoteScript,

    // Local dev mode (main.ts) — run local script from cache
    executeLocalScript,
    tryExecuteLocalScript,
    handleLocalDevModeUpdate,
    registerWatchLocalFilesMenu,

    // Dev mode flags (main.ts)
    isEditorDevMode,
    getEditorDevHost,
    isLocalDevMode,
    getLocalDevHost,
    getActiveDevMode,
    EDITOR_DEV_EVENT_KEY,
    LOCAL_DEV_EVENT_KEY,

    // Script update / HMR (main.ts)
    getScriptUpdate,
    watchHMRUpdates,

    // Tab communication (script-update and others)
    getTabCommunication,
  })
}
