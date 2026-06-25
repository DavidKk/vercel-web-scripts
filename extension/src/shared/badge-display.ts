import type { TabBadgePhase } from './tab-trigger-badge'

/** Chrome accepts hex or RGBA; RGBA is more reliable for badge text on macOS. */
export const BADGE_BACKGROUND = '#3b82f6'
export const BADGE_BACKGROUND_ERROR = '#dc2626'
export const BADGE_BACKGROUND_IDLE = '#6b7280'
export const BADGE_BACKGROUND_WARN = '#d97706'
export const BADGE_BACKGROUND_SUCCESS = '#16a34a'
export const BADGE_TEXT_RGBA: [number, number, number, number] = [255, 255, 255, 255]

/** Non-empty badge text when shell is off or a script failed with no trigger count. */
export const BADGE_ALERT_TEXT = '!'

const BADGE_PHASE_TEXT: Record<TabBadgePhase, string> = {
  initializing: '…',
  idle: '·',
  'no-config': '?',
  'reset-done': '✓',
  'update-done': '↻',
}

const BADGE_PHASE_BACKGROUND: Record<TabBadgePhase, string> = {
  initializing: BADGE_BACKGROUND,
  idle: BADGE_BACKGROUND_IDLE,
  'no-config': BADGE_BACKGROUND_WARN,
  'reset-done': BADGE_BACKGROUND_SUCCESS,
  'update-done': BADGE_BACKGROUND_SUCCESS,
}

export interface ResolvedBadgeDisplay {
  text: string
  backgroundColor: string
}

export interface ResolveBadgeDisplayInput {
  isHttpTab: boolean
  shellEnabled: boolean
  triggerCount: number
  hasError: boolean
  phase: TabBadgePhase | undefined
}

/**
 * Resolve toolbar badge text and background for a tab.
 * @param input Tab shell state and trigger counters
 * @returns Display payload, or `null` when the badge should be hidden
 */
export function resolveBadgeDisplay(input: ResolveBadgeDisplayInput): ResolvedBadgeDisplay | null {
  if (!input.isHttpTab) {
    return null
  }
  if (!input.shellEnabled) {
    return { text: BADGE_ALERT_TEXT, backgroundColor: BADGE_BACKGROUND_ERROR }
  }
  if (input.triggerCount > 0) {
    return {
      text: String(Math.min(input.triggerCount, 99)),
      backgroundColor: input.hasError ? BADGE_BACKGROUND_ERROR : BADGE_BACKGROUND,
    }
  }
  if (input.hasError) {
    return { text: BADGE_ALERT_TEXT, backgroundColor: BADGE_BACKGROUND_ERROR }
  }
  if (input.phase) {
    return {
      text: BADGE_PHASE_TEXT[input.phase],
      backgroundColor: BADGE_PHASE_BACKGROUND[input.phase],
    }
  }
  return { text: BADGE_PHASE_TEXT.idle, backgroundColor: BADGE_PHASE_BACKGROUND.idle }
}
