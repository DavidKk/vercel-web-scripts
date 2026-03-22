/**
 * Shell network toggle: when off (default), launcher and preset avoid HTTP to the deployment
 * except during explicit menu actions (wrapped in bypass). GIST scripts may still use GME_fetch etc.
 */

import { SHELL_NETWORK_ENABLED_KEY } from '@/constants'

/** Previous GM key (auto cross-tab apply). Treated as shell network on when new key is unset. */
const LEGACY_AUTO_UPDATE_SCRIPT_KEY = 'vws_auto_update_script'

let shellNetworkBypassDepth = 0

/**
 * User preference: shell may talk to the deployment (preset URL, rules API, remote script, dev SSE/HMR).
 * @returns True when enabled or legacy auto-update was on before migration
 */
export function isShellNetworkEnabled(): boolean {
  const v = GM_getValue<boolean | undefined>(SHELL_NETWORK_ENABLED_KEY)
  if (v === true) {
    return true
  }
  if (v === false) {
    return false
  }
  return GM_getValue<boolean | undefined>(LEGACY_AUTO_UPDATE_SCRIPT_KEY) === true
}

/**
 * Persist shell network preference and drop legacy key.
 * @param enabled - When false, shell stays on cached preset/remote/rules only until user turns on or uses Update menus
 */
export function setShellNetworkEnabled(enabled: boolean): void {
  GM_setValue(SHELL_NETWORK_ENABLED_KEY, enabled)
  try {
    GM_deleteValue(LEGACY_AUTO_UPDATE_SCRIPT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * True when shell network is on or a user action (e.g. Update Script) temporarily allows requests.
 */
export function isShellNetworkEffectivelyEnabled(): boolean {
  return shellNetworkBypassDepth > 0 || isShellNetworkEnabled()
}

/**
 * Run an async task with shell network requests allowed (Update Script / Update Rules menus).
 * @param fn - Async work that may fetch rules or remote script
 */
export async function runWithShellNetworkAsync<T>(fn: () => Promise<T>): Promise<T> {
  shellNetworkBypassDepth++
  try {
    return await fn()
  } finally {
    shellNetworkBypassDepth = Math.max(0, shellNetworkBypassDepth - 1)
  }
}
