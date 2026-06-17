import { compareSemver, isSemverNewer, isStrictSemverVersion } from '@shared/semver-compare'

describe('semver-compare', () => {
  it('should treat equal versions as not newer', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
    expect(isSemverNewer('1.2.3', '1.2.3')).toBe(false)
  })

  it('should compare patch and minor semver segments', () => {
    expect(isSemverNewer('0.2.0', '0.1.9')).toBe(true)
    expect(isSemverNewer('0.1.10', '0.1.9')).toBe(true)
    expect(isSemverNewer('0.1.8', '0.1.9')).toBe(false)
  })

  it('should ignore leading v prefix', () => {
    expect(isSemverNewer('v0.2.0', '0.1.0')).toBe(true)
  })

  it('should validate strict semver x.x.x format', () => {
    expect(isStrictSemverVersion('1.0.0')).toBe(true)
    expect(isStrictSemverVersion('v1.2.3')).toBe(true)
    expect(isStrictSemverVersion('0.12.0')).toBe(true)
    expect(isStrictSemverVersion('2026.6.15')).toBe(true)
    expect(isStrictSemverVersion('0.1')).toBe(false)
    expect(isStrictSemverVersion('0.12')).toBe(false)
    expect(isStrictSemverVersion('2026-06-15')).toBe(false)
    expect(isStrictSemverVersion('1.0.0-beta')).toBe(false)
  })
})
