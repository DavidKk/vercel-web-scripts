/**
 * Global Registry Service
 *
 * Single source of truth for registering preset APIs onto globalThis.
 * Ensures both main.ts (no imports) and external GIST scripts can access
 * required functions after the preset IIFE bundle runs.
 *
 * Must be loaded after all helpers, services, and UI modules and before main.
 */

import * as dom from '@/helpers/dom'
import * as http from '@/helpers/http'
import * as locator from '@/helpers/locator'
import * as logger from '@/helpers/logger'
import * as utils from '@/helpers/utils'
import { findElementByXPath, generateXPath } from '@/helpers/xpath'
import { fetchAndCacheRules, fetchRulesFromCache, matchUrl } from '@/rules'
import { fetchScript } from '@/scripts'
import {
  EDITOR_DEV_EVENT_KEY,
  getActiveDevMode,
  getEditorDevHost,
  getHasExecutedEditorScript,
  getLocalDevHost,
  handleEditorDevModeUpdate,
  handleLocalDevModeUpdate,
  isEditorDevMode,
  isLocalDevMode,
  LOCAL_DEV_EVENT_KEY,
  setHasExecutedEditorScript,
  setupEditorPostMessageListener,
  tryExecuteLocalScript,
} from '@/services/dev-mode'
import { logStore } from '@/services/log-store'
import { registerBasicMenus } from '@/services/menu'
import { executeEditorScript, executeLocalScript, executeRemoteScript, watchHMRUpdates } from '@/services/script-execution'
import { getScriptUpdate } from '@/services/script-update'
import { getTabCommunication } from '@/services/tab-communication'
import { GME_openCommandPalette, GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import { GME_registerMenuCommand, GME_updateMenuCommand } from '@/ui/corner-widget/index'
import { GME_openLogViewer } from '@/ui/log-viewer/index'
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
} from '@/ui/node-selector/index'
import { GME_notification as GME_notificationUI } from '@/ui/notification/index'

/**
 * Register all preset APIs onto globalThis (or __GLOBAL__ when run by launcher so preset and remote share the same sandbox).
 * Called once at preset load; main.ts and GIST scripts rely on these globals.
 */
export function registerGlobals(): void {
  const g = typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any)

  Object.assign(g, {
    // Helpers (public API for GIST scripts)
    ...utils,
    ...http,
    ...logger,
    ...dom,
    ...locator,
    generateXPath,
    findElementByXPath,
    logStore,

    // Script loading (used by script-execution, dev-mode/local, script-update). fetchCompileScript/loadScript not exposed to avoid GIST calling compile on every page.
    fetchScript,

    // UI public API (GIST scripts)
    GME_openLogViewer,
    GME_notification: GME_notificationUI,
    GME_openCommandPalette,
    GME_registerCommandPaletteCommand,
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
