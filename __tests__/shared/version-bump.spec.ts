import { applySemverBump, buildReleaseCommitSubject, commitsAfterLastRelease, isReleaseCommitSubject, resolveBumpLevel } from '@shared/version-bump'

describe('version-bump', () => {
  it('should resolve minor when any feat commit is present', () => {
    expect(resolveBumpLevel(['fix: typo', 'feat: add TraceId'])).toBe('minor')
    expect(resolveBumpLevel(['feat(extension): popup polish'])).toBe('minor')
    expect(resolveBumpLevel(['feat!: breaking api'])).toBe('minor')
    expect(resolveBumpLevel(['chore: prep\n\nBREAKING CHANGE: gone'])).toBe('minor')
  })

  it('should resolve patch when there is no feat (including fix-only)', () => {
    expect(resolveBumpLevel(['fix: badge color'])).toBe('patch')
    expect(resolveBumpLevel(['fix: a', 'chore: b', 'docs: c'])).toBe('patch')
  })

  it('should ignore release commits when resolving bump level', () => {
    expect(resolveBumpLevel(['chore(release): 0.1.1'])).toBeNull()
    expect(resolveBumpLevel(['chore(release): 0.1.1', 'fix: still counts'])).toBe('patch')
  })

  it('should return null for empty input', () => {
    expect(resolveBumpLevel([])).toBeNull()
    expect(resolveBumpLevel(['', '  '])).toBeNull()
  })

  it('should apply minor and patch semver bumps', () => {
    expect(applySemverBump('0.1.0', 'minor')).toBe('0.2.0')
    expect(applySemverBump('0.1.0', 'patch')).toBe('0.1.1')
    expect(applySemverBump('v1.2.3', 'minor')).toBe('1.3.0')
    expect(applySemverBump('1.2.3-alpha.1', 'patch')).toBe('1.2.4')
  })

  it('should detect and build release commit subjects', () => {
    expect(isReleaseCommitSubject('chore(release): 0.2.0')).toBe(true)
    expect(isReleaseCommitSubject('chore(release): 0.2.0\n\nbody')).toBe(false)
    expect(buildReleaseCommitSubject('0.2.0')).toBe('chore(release): 0.2.0')
  })

  it('should only consider commits after the last release', () => {
    expect(commitsAfterLastRelease(['feat: a', 'chore(release): 0.2.0', 'chore: sync hooks'])).toEqual(['chore: sync hooks'])
    expect(commitsAfterLastRelease(['feat: a', 'fix: b'])).toEqual(['feat: a', 'fix: b'])
    expect(commitsAfterLastRelease(['chore(release): 0.2.0'])).toEqual([])
  })
})
