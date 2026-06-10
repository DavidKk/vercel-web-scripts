import { isShellEnabledForTabState } from '../../extension/src/shared/extension-storage/shell-master-switch-pure'

describe('shell master switch pure', () => {
  it('should treat missing global enable as off for all tabs', () => {
    expect(isShellEnabledForTabState(false, [], 1)).toBe(false)
    expect(isShellEnabledForTabState(false, [2], 1)).toBe(false)
  })

  it('should allow tabs when global is on and tab is not disabled', () => {
    expect(isShellEnabledForTabState(true, [], 42)).toBe(true)
    expect(isShellEnabledForTabState(true, [7, 8], 42)).toBe(true)
  })

  it('should block disabled tabs even when global is on', () => {
    expect(isShellEnabledForTabState(true, [42], 42)).toBe(false)
  })
})
