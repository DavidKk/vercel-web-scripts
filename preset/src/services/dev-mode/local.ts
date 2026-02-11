/**
 * Local dev mode handling
 */

import { getWebScriptId } from '@/helpers/env'
import { GME_debug } from '@/helpers/logger'
import { getLocalDevFiles, getLocalDevHost, isEditorPage, isLocalDevMode, LOCAL_DEV_EVENT_KEY } from '@/services/dev-mode/constants'
import { executeLocalScript as runLocalScript } from '@/services/script-execution'

/**
 * Track if local script has been executed
 */
let hasExecutedLocalScript = false

/**
 * Try to execute local script if conditions are met
 * @param isRemoteScript Whether this is a remote script execution
 * @returns True if script was executed
 */
export function tryExecuteLocalScript(isRemoteScript: boolean): boolean {
  if (hasExecutedLocalScript || isRemoteScript) {
    return false
  }

  // Editor page (HOST) should not execute scripts, it only sends files to other pages
  if (isEditorPage()) {
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
    runLocalScript()
    return true
  }
  return false
}

/**
 * Handle local dev mode updates from GM_addValueChangeListener
 * @param oldValue Previous value
 * @param newValue New value
 * @param isDevMode Whether this tab is the dev mode host
 */
export function handleLocalDevModeUpdate(oldValue: any, newValue: any, isDevMode: boolean): void {
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

  // Host tab (the one that started Watch Local Files) does not reload on update; only other tabs reload
  if (getWebScriptId() === newValue.host || isDevMode) {
    return
  }

  // Do not re-execute script on update; only reload so script runs once on next page load (same as editor dev mode)
  if (document.hidden) {
    GME_debug('[Local Dev Mode] Local files updated, but tab is not active, will reload when tab becomes visible')
    scheduleReloadWhenTabActiveLocal()
    return
  }
  GME_debug('[Local Dev Mode] Local files updated, reloading page (active tab)...')
  window.location.reload()
}

const PENDING_RELOAD_LOCAL_KEY = '__WEB_SCRIPT_PENDING_LOCAL_RELOAD__'

/**
 * When tab was hidden on local update, schedule a reload when tab becomes active.
 */
function scheduleReloadWhenTabActiveLocal(): void {
  const win = typeof window !== 'undefined' ? (window as any) : undefined
  if (!win) return
  if (win[PENDING_RELOAD_LOCAL_KEY]) {
    GME_debug('[Local Dev Mode] Already have pending reload on visibility')
    return
  }
  win[PENDING_RELOAD_LOCAL_KEY] = true
  const onVisible = (): void => {
    if (document.hidden) return
    document.removeEventListener('visibilitychange', onVisible)
    win[PENDING_RELOAD_LOCAL_KEY] = undefined
    if (!GM_getValue(LOCAL_DEV_EVENT_KEY)) return
    GME_debug('[Local Dev Mode] Tab became active, reloading page (pending update)...')
    window.location.reload()
  }
  document.addEventListener('visibilitychange', onVisible)
}
