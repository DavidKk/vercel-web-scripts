/**
 * Editor publish push → in-place script update on open tabs.
 */

import {
  isPassiveOtaNotifyLocked,
  SCRIPT_UPDATE_PUSH_KEY,
  SCRIPT_UPDATE_PUSH_LOCK_KEY,
  SCRIPT_UPDATE_PUSH_LOCK_MS,
  SCRIPT_UPDATE_PUSH_PENDING_KEY,
} from '@shared/ota-passive-update'

import { isEditorPage } from '@/services/dev-mode/constants'
import { clearAllRuntimeGmCachesInPage } from '@/services/launcher-bootstrap-storage'
import { getScriptUpdate } from '@/services/script-update'
import { isShellNetworkEnabled, runWithShellNetworkAsync } from '@/services/shell-network-settings'
import { GME_notification } from '@/ui/notification/index'

const PUSH_VISIBILITY_LISTENER_FLAG = '__VWS_SCRIPT_PUSH_VISIBILITY_LISTENER__'

let scriptUpdatePushListenerRegistered = false

function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function isScriptUpdatePushLocked(now = Date.now()): boolean {
  return isPassiveOtaNotifyLocked(GM_getValue(SCRIPT_UPDATE_PUSH_LOCK_KEY, 0), now)
}

async function runScriptUpdatePushFromChannel(): Promise<void> {
  if (isEditorPage()) {
    return
  }
  if (!isShellNetworkEnabled()) {
    GME_debug('[Script Update] Push channel fired but shell network off, skipping')
    GME_notification('Shell network is off. Enable it to apply script updates.', 'info', 5000)
    return
  }

  const now = Date.now()
  if (isScriptUpdatePushLocked(now)) {
    GME_debug('[Script Update] Push deduped (another tab is handling)')
    return
  }

  GM_setValue(SCRIPT_UPDATE_PUSH_LOCK_KEY, now + SCRIPT_UPDATE_PUSH_LOCK_MS)
  GME_debug('[Script Update] Push channel handling, starting in-place update...')
  await runWithShellNetworkAsync(async () => {
    clearAllRuntimeGmCachesInPage()
    await getScriptUpdate().update(__SCRIPT_URL__)
  })
}

function ensureScriptUpdatePushVisibilityListener(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }
  const win = window as unknown as Record<string, unknown>
  if (win[PUSH_VISIBILITY_LISTENER_FLAG]) {
    return
  }
  win[PUSH_VISIBILITY_LISTENER_FLAG] = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      return
    }
    if (!GM_getValue(SCRIPT_UPDATE_PUSH_PENDING_KEY, 0)) {
      return
    }
    GM_deleteValue(SCRIPT_UPDATE_PUSH_PENDING_KEY)
    void runScriptUpdatePushFromChannel()
  })
}

/**
 * Process a deferred script-update push when the tab becomes visible.
 */
export function flushScriptUpdatePushPending(): void {
  if (!isPageVisible() || !GM_getValue(SCRIPT_UPDATE_PUSH_PENDING_KEY, 0)) {
    return
  }
  GM_deleteValue(SCRIPT_UPDATE_PUSH_PENDING_KEY)
  void runScriptUpdatePushFromChannel()
}

function handleScriptUpdatePushSignal(): void {
  if (isEditorPage()) {
    return
  }
  if (!isPageVisible()) {
    GM_setValue(SCRIPT_UPDATE_PUSH_PENDING_KEY, Date.now())
    ensureScriptUpdatePushVisibilityListener()
    GME_debug('[Script Update] Push deferred until tab is visible')
    return
  }
  void runScriptUpdatePushFromChannel()
}

/**
 * Listen for editor publish / helper push and run in-place script update on non-editor tabs.
 */
export function setupScriptUpdatePushListener(): void {
  if (scriptUpdatePushListenerRegistered) {
    return
  }
  scriptUpdatePushListenerRegistered = true
  GM_addValueChangeListener(SCRIPT_UPDATE_PUSH_KEY, (_name, _oldVal, newVal) => {
    if (newVal == null) {
      return
    }
    handleScriptUpdatePushSignal()
  })
}

/**
 * Broadcast in-place script update to open tabs (GM storage channel).
 */
export function pushScriptUpdateToOpenTabs(): void {
  GM_setValue(SCRIPT_UPDATE_PUSH_KEY, Date.now())
}
