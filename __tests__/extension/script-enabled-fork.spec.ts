import { resolveScriptEnabledFlag } from '../../extension/src/shared/extension-multi-service-pure'

describe('script enabled incognito fork', () => {
  it('should prefer incognito override when present', () => {
    expect(
      resolveScriptEnabledFlag({
        incognito: true,
        incognitoValue: false,
        scopedValue: true,
        legacyValue: true,
      })
    ).toBe(false)
  })

  it('should fall back to normal scoped key when incognito unset', () => {
    expect(
      resolveScriptEnabledFlag({
        incognito: true,
        incognitoValue: undefined,
        scopedValue: false,
        legacyValue: true,
      })
    ).toBe(false)
  })

  it('should ignore incognito bucket in normal reads', () => {
    expect(
      resolveScriptEnabledFlag({
        incognito: false,
        incognitoValue: false,
        scopedValue: true,
        legacyValue: false,
      })
    ).toBe(true)
  })

  it('should default to enabled when no keys exist', () => {
    expect(
      resolveScriptEnabledFlag({
        incognito: true,
        incognitoValue: undefined,
        scopedValue: undefined,
        legacyValue: undefined,
      })
    ).toBe(true)
  })
})
