import { formatPopupVersionFooter, POPUP_PRESET_VERSION_LOADING } from '../../extension/src/ui/popup-version-footer'

describe('formatPopupVersionFooter', () => {
  it('should always include extension version from manifest', () => {
    expect(formatPopupVersionFooter('0.1.0', null)).toBe('Preset v— · Extension v0.1.0')
  })

  it('should show loading preset slot with same layout as resolved semver', () => {
    const loading = formatPopupVersionFooter('0.1.0', null, { presetLoading: true })
    const resolved = formatPopupVersionFooter('0.1.0', '0.1.0')
    expect(loading).toBe(`Preset v${POPUP_PRESET_VERSION_LOADING} · Extension v0.1.0`)
    expect(loading.length).toBeGreaterThan(0)
    expect(resolved).toBe('Preset v0.1.0 · Extension v0.1.0')
  })

  it('should prefer resolved preset over loading flag', () => {
    expect(formatPopupVersionFooter('0.2.0', '0.1.0', { presetLoading: true })).toBe('Preset v0.1.0 · Extension v0.2.0')
  })
})
