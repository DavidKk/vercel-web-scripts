import { decideOtaModuleApply } from '@/shared/ota-apply-policy'

describe('ota-apply-policy', () => {
  it('should skip when remote hash equals local hash', () => {
    expect(
      decideOtaModuleApply({
        moduleId: 'script-bundle',
        remoteHash: 'abc',
        localHash: 'abc',
        hasLocalCache: true,
      })
    ).toEqual({ apply: false, reason: 'hash-unchanged' })
  })

  it('should block alpha bundle without acceptAlpha', () => {
    expect(
      decideOtaModuleApply({
        moduleId: 'script-bundle-alpha',
        remoteHash: 'remote',
        localHash: 'local',
        hasLocalCache: true,
      })
    ).toEqual({ apply: false, reason: 'alpha-bundle-not-subscribed' })
  })

  it('should allow alpha bundle when acceptAlpha is true', () => {
    expect(
      decideOtaModuleApply({
        moduleId: 'script-bundle-alpha',
        remoteHash: 'remote',
        localHash: 'local',
        hasLocalCache: true,
        clientPrefs: { acceptAlpha: true },
      })
    ).toEqual({ apply: true, reason: 'policy-allowed' })
  })

  it('should respect runtime autoUpgrade=false when cache exists', () => {
    expect(
      decideOtaModuleApply({
        moduleId: 'preset-core',
        remoteHash: 'remote',
        localHash: 'local',
        hasLocalCache: true,
        runtimePolicy: { stage: 'stable', autoUpgrade: false, lockedVersion: null },
      })
    ).toEqual({ apply: false, reason: 'auto-upgrade-disabled' })
  })

  it('should allow manual update to bypass autoUpgrade=false', () => {
    expect(
      decideOtaModuleApply({
        moduleId: 'preset-core',
        remoteHash: 'remote',
        localHash: 'local',
        hasLocalCache: true,
        runtimePolicy: { stage: 'stable', autoUpgrade: false, lockedVersion: null },
        clientPrefs: { manualUpdate: true },
      })
    ).toEqual({ apply: true, reason: 'manual-update' })
  })
})
