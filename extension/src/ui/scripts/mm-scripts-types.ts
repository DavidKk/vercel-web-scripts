import type { ScriptKeyScriptsGroupView } from '@ext/shared/extension-storage'
import type { ScriptOtaPolicy } from '@shared/script-ota-policy'

export const STAGE_BADGE_CLASS: Record<'stable' | 'alpha', string> = {
  stable: 'mm-script-stage-badge mm-script-stage-badge--stable',
  alpha: 'mm-script-stage-badge mm-script-stage-badge--alpha',
}

export type ScriptRow = {
  scriptKey: string
  file: string
  label: string
  description?: string
  icon?: string
  version?: string
  author?: string
  contentHash?: string
  updatedAt?: number
  /** SERVER OTA policy (resolved defaults when omitted in index). */
  ota: ScriptOtaPolicy
  /** Per scriptKey: subscribe to alpha bundle artifacts. */
  acceptAlpha: boolean
  serviceLabel: string
  serviceUrl: string
  installed: boolean
  enabled: boolean
  groupActive: boolean
  /** Stable server list order within scriptKey group. */
  sortIndex: number
}

export type ScriptKeyGroupView = ScriptKeyScriptsGroupView & {
  rows: ScriptRow[]
}
