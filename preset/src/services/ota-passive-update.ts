/**
 * Passive OTA update handling for preset runtime (notify vs reload).
 */

import {
  isPassiveOtaNotifyLocked,
  nextPassiveOtaNotifyLockExpiry,
  OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY,
  OTA_PASSIVE_UPDATE_PENDING_KEY,
  type OtaPassiveUpdateKind,
  passiveOtaUpdateUserMessage,
  resolvePassiveOtaUpdateAction,
} from '@shared/ota-passive-update'

import { GME_debug } from '@/helpers/logger'
import { GME_notification } from '@/ui/notification/index'

const VISIBILITY_LISTENER_FLAG = '__VWS_OTA_PASSIVE_VISIBILITY_LISTENER__'

function isPageVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible'
}

function showPassiveOtaNotification(kind: OtaPassiveUpdateKind): void {
  const now = Date.now()
  const lockUntil = GM_getValue(OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY, 0)
  if (isPassiveOtaNotifyLocked(lockUntil, now)) {
    GME_debug(`[OTA passive] ${kind}: notify suppressed (lock active)`)
    return
  }

  GM_setValue(OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY, nextPassiveOtaNotifyLockExpiry(now))
  const message = passiveOtaUpdateUserMessage(kind)
  GME_debug(`[OTA passive] ${kind}: notify user`)
  GME_notification(message, 'info', 8000)
}

function ensurePassiveOtaVisibilityListener(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return
  }
  const win = window as unknown as Record<string, unknown>
  if (win[VISIBILITY_LISTENER_FLAG]) {
    return
  }
  win[VISIBILITY_LISTENER_FLAG] = true
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      flushPassiveOtaUpdatePending()
    }
  })
}

/**
 * Show a deferred passive OTA notification when the tab becomes visible.
 */
export function flushPassiveOtaUpdatePending(): void {
  if (!isPageVisible()) {
    return
  }
  const kind = GM_getValue(OTA_PASSIVE_UPDATE_PENDING_KEY, '') as OtaPassiveUpdateKind | ''
  if (!kind) {
    return
  }
  GM_deleteValue(OTA_PASSIVE_UPDATE_PENDING_KEY)
  showPassiveOtaNotification(kind)
}

/**
 * Handle a passive OTA update: reload when uninitialized or manual; otherwise notify once per lock window.
 * @param kind Updated module category
 * @param runtimeInitialized True when content already executed on this page
 * @param manualUpdate True for user-initiated update flows
 */
export function handlePassiveOtaUpdate(kind: OtaPassiveUpdateKind, runtimeInitialized: boolean, manualUpdate = false): void {
  const action = resolvePassiveOtaUpdateAction(runtimeInitialized, manualUpdate)
  if (action === 'reload') {
    GME_debug(`[OTA passive] ${kind}: reload (initialized=${runtimeInitialized} manual=${manualUpdate})`)
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
    return
  }

  if (!isPageVisible()) {
    GM_setValue(OTA_PASSIVE_UPDATE_PENDING_KEY, kind)
    ensurePassiveOtaVisibilityListener()
    GME_debug(`[OTA passive] ${kind}: notify deferred (tab hidden)`)
    return
  }

  showPassiveOtaNotification(kind)
}
