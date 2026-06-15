import { computeScriptsFooterStats, formatScriptsFooterText } from '../../extension/src/ui/mm-scripts-footer'

describe('mm-scripts-footer', () => {
  describe('formatScriptsFooterText', () => {
    it('should format service and script totals', () => {
      expect(
        formatScriptsFooterText({
          serviceCount: 1,
          scriptTotal: 12,
          installedCount: 10,
          enabledCount: 8,
          uninstalledCount: 2,
        })
      ).toBe('1 service · 12 scripts · 10 installed · 8 enabled · 2 uninstalled')
    })

    it('should prefix visible count when filtered', () => {
      expect(
        formatScriptsFooterText({
          serviceCount: 2,
          scriptTotal: 10,
          installedCount: 9,
          enabledCount: 7,
          uninstalledCount: 1,
          visibleCount: 3,
          filtered: true,
        })
      ).toBe('Showing 3 of 10 · 2 services · 10 scripts · 9 installed · 7 enabled · 1 uninstalled')
    })
  })

  describe('computeScriptsFooterStats', () => {
    it('should count unique services and install states', () => {
      expect(
        computeScriptsFooterStats([
          { serviceLabel: 'A', installed: true, enabled: true },
          { serviceLabel: 'A', installed: true, enabled: false },
          { serviceLabel: 'B', installed: false, enabled: false },
        ])
      ).toEqual({
        serviceCount: 2,
        scriptTotal: 3,
        installedCount: 2,
        enabledCount: 1,
        uninstalledCount: 1,
      })
    })
  })
})
