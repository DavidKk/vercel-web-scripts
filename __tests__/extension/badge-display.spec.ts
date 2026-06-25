import {
  BADGE_ALERT_TEXT,
  BADGE_BACKGROUND,
  BADGE_BACKGROUND_ERROR,
  BADGE_BACKGROUND_IDLE,
  BADGE_BACKGROUND_SUCCESS,
  BADGE_BACKGROUND_WARN,
  resolveBadgeDisplay,
} from '@ext/shared/badge-display'

describe('badge-display', () => {
  it('should hide badge on non-http tabs', () => {
    expect(
      resolveBadgeDisplay({
        isHttpTab: false,
        shellEnabled: true,
        triggerCount: 0,
        hasError: false,
        phase: 'initializing',
      })
    ).toBeNull()
  })

  it('should show alert when shell is disabled', () => {
    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: false,
        triggerCount: 2,
        hasError: false,
        phase: undefined,
      })
    ).toEqual({ text: BADGE_ALERT_TEXT, backgroundColor: BADGE_BACKGROUND_ERROR })
  })

  it('should prefer trigger count over phase text', () => {
    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 3,
        hasError: false,
        phase: 'initializing',
      })
    ).toEqual({ text: '3', backgroundColor: BADGE_BACKGROUND })
  })

  it('should show red count when scripts ran but one failed', () => {
    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 2,
        hasError: true,
        phase: undefined,
      })
    ).toEqual({ text: '2', backgroundColor: BADGE_BACKGROUND_ERROR })
  })

  it('should map lifecycle phases to badge text and colors', () => {
    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 0,
        hasError: false,
        phase: 'initializing',
      })
    ).toEqual({ text: '…', backgroundColor: BADGE_BACKGROUND })

    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 0,
        hasError: false,
        phase: 'idle',
      })
    ).toEqual({ text: '·', backgroundColor: BADGE_BACKGROUND_IDLE })

    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 0,
        hasError: false,
        phase: 'no-config',
      })
    ).toEqual({ text: '?', backgroundColor: BADGE_BACKGROUND_WARN })

    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 0,
        hasError: false,
        phase: 'reset-done',
      })
    ).toEqual({ text: '✓', backgroundColor: BADGE_BACKGROUND_SUCCESS })

    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 0,
        hasError: false,
        phase: 'update-done',
      })
    ).toEqual({ text: '↻', backgroundColor: BADGE_BACKGROUND_SUCCESS })
  })

  it('should show alert when failed with zero triggers', () => {
    expect(
      resolveBadgeDisplay({
        isHttpTab: true,
        shellEnabled: true,
        triggerCount: 0,
        hasError: true,
        phase: 'idle',
      })
    ).toEqual({ text: BADGE_ALERT_TEXT, backgroundColor: BADGE_BACKGROUND_ERROR })
  })
})
