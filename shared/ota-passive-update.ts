/** GM key: dedupe passive OTA user notifications across modules/tabs. */
export const OTA_PASSIVE_UPDATE_NOTIFY_LOCK_KEY = 'vws_ota_passive_update_notify_lock'

/** Minimum interval between passive OTA toast notifications. */
export const OTA_PASSIVE_UPDATE_NOTIFY_LOCK_MS = 60_000

/** GM key: editor publish / helper triggers in-place script update on open tabs. */
export const SCRIPT_UPDATE_PUSH_KEY = 'vws_script_update_push'

/** GM key: dedupe simultaneous script-update push handling across tabs. */
export const SCRIPT_UPDATE_PUSH_LOCK_KEY = 'vws_script_update_push_lock'

/** TTL for {@link SCRIPT_UPDATE_PUSH_LOCK_KEY}. */
export const SCRIPT_UPDATE_PUSH_LOCK_MS = 30_000

/** GM key: script-update push deferred until tab becomes visible. */
export const SCRIPT_UPDATE_PUSH_PENDING_KEY = 'vws_script_update_push_pending'

/** GM key: passive OTA toast deferred until tab becomes visible. */
export const OTA_PASSIVE_UPDATE_PENDING_KEY = 'vws_ota_passive_update_pending'

export type OtaPassiveUpdateKind = 'remote-script' | 'optional-ui' | 'preset-core' | 'runtime'

const KIND_MESSAGES: Record<OtaPassiveUpdateKind, string> = {
  'remote-script': 'Scripts update available. Reload the page or use "Update Script" to apply.',
  'optional-ui': 'Preset UI update available. Reload the page to apply.',
  'preset-core': 'Preset update available. Reload the page to apply.',
  runtime: 'Runtime update available. Reload the page to apply.',
}

/**
 * User-facing message for a passive OTA update notification.
 * @param kind Updated module category
 * @returns Notification body text
 */
export function passiveOtaUpdateUserMessage(kind: OtaPassiveUpdateKind): string {
  return KIND_MESSAGES[kind]
}

/**
 * Whether a passive OTA notify lock is still active.
 * @param lockUntil Stored lock expiry (ms epoch)
 * @param now Current time
 * @returns True when notifications should be suppressed
 */
export function isPassiveOtaNotifyLocked(lockUntil: unknown, now = Date.now()): boolean {
  const lock = Number(lockUntil)
  return Number.isFinite(lock) && lock > now
}

/**
 * Next notify lock expiry timestamp.
 * @param now Current time
 * @returns Epoch ms when the lock expires
 */
export function nextPassiveOtaNotifyLockExpiry(now = Date.now()): number {
  return now + OTA_PASSIVE_UPDATE_NOTIFY_LOCK_MS
}

/**
 * Resolve passive OTA handling: reload for uninitialized/manual, notify when runtime is warm.
 * @param runtimeInitialized True when the module already ran on this page load
 * @param manualUpdate True when user explicitly requested update (Update runtime, etc.)
 * @returns `reload` or `notify`
 */
export function resolvePassiveOtaUpdateAction(runtimeInitialized: boolean, manualUpdate = false): 'reload' | 'notify' {
  if (manualUpdate) {
    return 'reload'
  }
  if (!runtimeInitialized) {
    return 'reload'
  }
  return 'notify'
}
