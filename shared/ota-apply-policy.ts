import type { OtaReleaseStage, RuntimeOtaPolicy, ScriptOtaPolicy } from './script-ota-policy'

/** Client preferences for OTA module application. */
export interface OtaClientPreferences {
  /** Subscribe to alpha-stage modules (default false). */
  acceptAlpha?: boolean
  /** Manual update from popup bypasses autoUpgrade=false when true. */
  manualUpdate?: boolean
}

/** Inputs for deciding whether to apply a remote module revision. */
export interface OtaApplyDecisionInput {
  moduleId: string
  remoteHash: string | null
  localHash: string | null
  hasLocalCache: boolean
  runtimePolicy?: RuntimeOtaPolicy
  scriptPolicy?: ScriptOtaPolicy & { version?: string }
  clientPrefs?: OtaClientPreferences
}

/** Result of OTA apply policy evaluation. */
export interface OtaApplyDecision {
  apply: boolean
  reason: string
}

/**
 * Whether a module stage is allowed for the client's alpha subscription.
 * @param stage Remote release stage
 * @param acceptAlpha Client opt-in
 * @returns True when stage is stable or client accepts alpha
 */
export function isOtaStageAllowedForClient(stage: OtaReleaseStage, acceptAlpha: boolean): boolean {
  if (stage === 'stable') {
    return true
  }
  return acceptAlpha
}

/**
 * Decide whether a remote module hash should be applied (auto or manual refresh).
 * @param input Decision inputs
 * @returns Apply flag and diagnostic reason
 */
export function decideOtaModuleApply(input: OtaApplyDecisionInput): OtaApplyDecision {
  const remoteHash = input.remoteHash?.trim() || null
  const localHash = input.localHash?.trim() || null
  const acceptAlpha = input.clientPrefs?.acceptAlpha === true
  const manualUpdate = input.clientPrefs?.manualUpdate === true

  if (!remoteHash) {
    return { apply: false, reason: 'no-remote-hash' }
  }
  if (remoteHash === localHash) {
    return { apply: false, reason: 'hash-unchanged' }
  }

  const isScriptBundle = input.moduleId === 'script-bundle' || input.moduleId === 'script-bundle-alpha'
  const isAlphaBundle = input.moduleId === 'script-bundle-alpha'

  if (isAlphaBundle && !acceptAlpha && !manualUpdate) {
    return { apply: false, reason: 'alpha-bundle-not-subscribed' }
  }

  const policy = isScriptBundle ? undefined : input.moduleId === 'preset-core' || input.moduleId === 'preset-ui' ? input.runtimePolicy : input.scriptPolicy

  const stage: OtaReleaseStage = isAlphaBundle ? 'alpha' : (policy?.stage ?? 'stable')

  if (!isOtaStageAllowedForClient(stage, acceptAlpha) && !manualUpdate) {
    return { apply: false, reason: 'stage-not-allowed' }
  }

  if (policy && policy.autoUpgrade === false && !manualUpdate) {
    if (input.hasLocalCache) {
      return { apply: false, reason: 'auto-upgrade-disabled' }
    }
  }

  if (policy && 'lockedVersion' in policy && policy.lockedVersion) {
    const remoteVersion = 'version' in policy ? policy.version : undefined
    if (remoteVersion && remoteVersion !== policy.lockedVersion && !manualUpdate) {
      return { apply: false, reason: 'locked-version-mismatch' }
    }
  }

  return { apply: true, reason: manualUpdate ? 'manual-update' : 'policy-allowed' }
}
