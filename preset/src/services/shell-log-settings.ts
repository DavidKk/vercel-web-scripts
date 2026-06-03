/**
 * Shell log persistence toggle: default off — logs stay in memory for the current tab session only.
 * When on, log-store writes to IndexedDB so Log Viewer can include previous sessions.
 */

import { SHELL_LOG_PERSIST_ENABLED_KEY } from '@/constants'

/**
 * Whether logs should be persisted to IndexedDB (cross-session history).
 * @returns True only when the user explicitly enabled persistence
 */
export function isLogPersistEnabled(): boolean {
  return GM_getValue<boolean | undefined>(SHELL_LOG_PERSIST_ENABLED_KEY) === true
}

/**
 * Persist log persistence preference.
 * @param enabled - When false, memory buffer is kept but IndexedDB is purged
 */
export function setLogPersistEnabled(enabled: boolean): void {
  GM_setValue(SHELL_LOG_PERSIST_ENABLED_KEY, enabled)
}
