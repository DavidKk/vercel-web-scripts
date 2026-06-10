import { compareSemver, isSemverNewer } from '../../shared/semver-compare'

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
})
