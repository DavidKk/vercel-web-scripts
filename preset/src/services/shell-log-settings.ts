/**
 * Shell log settings: output destination (console / log viewer / off) and optional IndexedDB persistence.
 */

import { normalizeShellLogOutputMode, type ShellLogOutputMode, shouldLogToConsoleForMode, shouldLogToMemoryForMode } from '@shared/shell-log-output'

import { SHELL_LOG_OUTPUT_MODE_KEY, SHELL_LOG_PERSIST_ENABLED_KEY } from '@/constants'
import { getSharedLogStore } from '@/services/log-store/global-access'

type WindowWithGmStore = Window & { __VWS_GM_STORE__?: Record<string, unknown> }

/**
 * Read mode from page bootstrap GM mirror when GM_getValue has no value yet.
 */
function readShellLogOutputModeFromPageStore(): ShellLogOutputMode | null {
  if (typeof window === 'undefined') {
    return null
  }
  const store = (window as WindowWithGmStore).__VWS_GM_STORE__
  if (!store || !(SHELL_LOG_OUTPUT_MODE_KEY in store)) {
    return null
  }
  return normalizeShellLogOutputMode(store[SHELL_LOG_OUTPUT_MODE_KEY])
}

/**
 * Current log output mode from GM storage.
 *
 * Tampermonkey userscript install has no Logger popup — mode stays {@link DEFAULT_SHELL_LOG_OUTPUT_MODE}
 * (`console`) unless the user sets `vws_shell_log_output_mode` in GM storage manually.
 * Extension shell exposes Console / Log Viewer / Off and syncs the key via popup + page bridge.
 */
export function getShellLogOutputMode(): ShellLogOutputMode {
  const raw = GM_getValue(SHELL_LOG_OUTPUT_MODE_KEY)
  if (raw !== undefined && raw !== null) {
    return normalizeShellLogOutputMode(raw)
  }
  return readShellLogOutputModeFromPageStore() ?? normalizeShellLogOutputMode(undefined)
}

/**
 * Persist log output mode.
 * @param mode - console, logviewer, or none
 */
export function setShellLogOutputMode(mode: ShellLogOutputMode): void {
  GM_setValue(SHELL_LOG_OUTPUT_MODE_KEY, mode)
}

/**
 * Whether the current call stack is inside a remote/local GIST script (`executeScript` / `executeWithGlobal`).
 * Used for env / feature flags (e.g. {@link IS_REMOTE_SCRIPT}), not for Logger console gating.
 */
export function isUserScriptLogContext(): boolean {
  const g = typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null
  if (!g || typeof g !== 'object') {
    return false
  }
  const flag = (g as Record<string, unknown>).__IS_REMOTE_EXECUTE__
  return flag === true
}

/**
 * Whether preset / shell GME_* logs should appear in the browser console (Logger output mode).
 * User GIST script body uses {@link enterScriptLogScope} / {@link createScriptGMELogger} → `emitScriptLog` (always console).
 * Native `console.*` is unaffected.
 */
export function shouldLogToConsole(): boolean {
  return shouldLogToConsoleForMode(getShellLogOutputMode())
}

/**
 * Whether logs should be pushed to the in-memory log store (Log Viewer).
 * User script lines still respect `none` (no capture); console/logviewer modes keep script lines in memory.
 */
export function shouldLogToMemory(): boolean {
  return shouldLogToMemoryForMode(getShellLogOutputMode())
}

/**
 * Whether logs should be persisted to IndexedDB (cross-session history).
 * @returns True only when the user explicitly enabled persistence
 */
export function isLogPersistEnabled(): boolean {
  return GM_getValue<boolean | undefined>(SHELL_LOG_PERSIST_ENABLED_KEY) === true
}

/**
 * Persist log persistence preference (GM storage, origin-scoped with other shell keys).
 * @param enabled - When false, memory buffer is kept but IndexedDB is purged
 */
export function setLogPersistEnabled(enabled: boolean): void {
  GM_setValue(SHELL_LOG_PERSIST_ENABLED_KEY, enabled)
}

/**
 * Apply log persistence toggle to GM storage and the shared in-memory log store.
 * @param enabled - When true, logs for this origin are written to IndexedDB; when false, IDB is purged
 */
export function applyLogPersistSetting(enabled: boolean): void {
  setLogPersistEnabled(enabled)
  getSharedLogStore()?.setPersistenceEnabled(enabled)
}
