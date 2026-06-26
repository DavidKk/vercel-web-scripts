import { decideOtaModuleApply } from '@/shared/ota-apply-policy'
import { mergeRemoteBundleWithOtaPolicy } from '@/shared/remote-script-ota-merge'
import { LEGACY_SCRIPT_OTA_DEFAULTS } from '@/shared/script-ota-policy'

describe('ota publish policy integration', () => {
  it('should keep pinned script modules while allowing other modules to upgrade', () => {
    const bundle = ['// a.ts', "console.log('a-new')", '', '// b.ts', "console.log('b-new')"].join('\n')
    const cache = {
      'a.ts': ['// a.ts', "console.log('a-old')"].join('\n'),
      'b.ts': ['// b.ts', "console.log('b-old')"].join('\n'),
    }

    const merge = mergeRemoteBundleWithOtaPolicy({
      content: bundle,
      moduleCache: cache,
      scriptPolicies: {
        'a.ts': { ...LEGACY_SCRIPT_OTA_DEFAULTS, autoUpgrade: false, version: '2.0.0' },
        'b.ts': { ...LEGACY_SCRIPT_OTA_DEFAULTS, version: '2.0.0' },
      },
    })

    expect(merge.pinnedFromCache).toEqual(['a.ts'])
    expect(merge.content).toContain("console.log('a-old')")
    expect(merge.content).toContain("console.log('b-new')")
  })

  it('should align preset-core manual update with per-file autoUpgrade bypass only', () => {
    const autoBlocked = decideOtaModuleApply({
      moduleId: 'preset-core',
      remoteHash: 'remote',
      localHash: 'local',
      hasLocalCache: true,
      runtimePolicy: { stage: 'stable', autoUpgrade: false, lockedVersion: null },
      clientPrefs: { manualUpdate: true },
    })
    expect(autoBlocked.apply).toBe(true)

    const alphaBlocked = decideOtaModuleApply({
      moduleId: 'preset-core',
      remoteHash: 'remote',
      localHash: 'local',
      hasLocalCache: true,
      runtimePolicy: { stage: 'alpha', autoUpgrade: false, lockedVersion: null },
      clientPrefs: { manualUpdate: true },
    })
    expect(alphaBlocked.apply).toBe(false)
  })
})
