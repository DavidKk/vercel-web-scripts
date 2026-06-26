import { isPassiveOtaNotifyLocked, passiveOtaUpdateUserMessage, resolvePassiveOtaUpdateAction } from '@shared/ota-passive-update'

describe('resolvePassiveOtaUpdateAction', () => {
  it('should reload when runtime is not initialized', () => {
    expect(resolvePassiveOtaUpdateAction(false)).toBe('reload')
  })

  it('should reload on manual update even when initialized', () => {
    expect(resolvePassiveOtaUpdateAction(true, true)).toBe('reload')
  })

  it('should notify when initialized and not manual', () => {
    expect(resolvePassiveOtaUpdateAction(true, false)).toBe('notify')
  })
})

describe('isPassiveOtaNotifyLocked', () => {
  it('should be locked before expiry', () => {
    expect(isPassiveOtaNotifyLocked(1000, 500)).toBe(true)
  })

  it('should be unlocked after expiry', () => {
    expect(isPassiveOtaNotifyLocked(500, 1000)).toBe(false)
  })
})

describe('passiveOtaUpdateUserMessage', () => {
  it('should return kind-specific copy', () => {
    expect(passiveOtaUpdateUserMessage('remote-script')).toContain('Update Script')
    expect(passiveOtaUpdateUserMessage('preset-core')).toContain('Preset')
  })
})
