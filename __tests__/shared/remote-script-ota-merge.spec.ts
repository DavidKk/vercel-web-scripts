import { mergeRemoteBundleWithOtaPolicy, shouldApplyRemoteScriptModuleUpgrade } from '@/shared/remote-script-ota-merge'
import { LEGACY_SCRIPT_OTA_DEFAULTS } from '@/shared/script-ota-policy'

describe('remote-script-ota-merge', () => {
  const bundle = ['// demo-a.ts', "console.log('a-v2')", '', '// demo-b.ts', "console.log('b-v2')"].join('\n')

  const cache = {
    'demo-a.ts': ['// demo-a.ts', "console.log('a-v1')", ''].join('\n'),
    'demo-b.ts': ['// demo-b.ts', "console.log('b-v1')", ''].join('\n'),
  }

  it('should pin modules when autoUpgrade is false and cache exists', () => {
    const result = mergeRemoteBundleWithOtaPolicy({
      content: bundle,
      moduleCache: cache,
      scriptPolicies: {
        'demo-a.ts': { ...LEGACY_SCRIPT_OTA_DEFAULTS, autoUpgrade: false },
        'demo-b.ts': LEGACY_SCRIPT_OTA_DEFAULTS,
      },
    })

    expect(result.pinnedFromCache).toEqual(['demo-a.ts'])
    expect(result.content).toContain("console.log('a-v1')")
    expect(result.content).toContain("console.log('b-v2')")
  })

  it('should allow manual update to bypass autoUpgrade=false', () => {
    expect(shouldApplyRemoteScriptModuleUpgrade('demo-a.ts', { ...LEGACY_SCRIPT_OTA_DEFAULTS, autoUpgrade: false }, true, true)).toBe(true)
  })

  it('should block locked version mismatch for script modules', () => {
    expect(shouldApplyRemoteScriptModuleUpgrade('demo-a.ts', { ...LEGACY_SCRIPT_OTA_DEFAULTS, lockedVersion: '1.0.0', version: '2.0.0' }, true, false)).toBe(false)
  })
})
