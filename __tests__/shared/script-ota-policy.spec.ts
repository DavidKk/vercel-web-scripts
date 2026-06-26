import {
  buildReleaseSnapshotPath,
  buildScriptPolicySummary,
  isReleaseSnapshotPath,
  NEW_SCRIPT_OTA_DEFAULTS,
  resolveRuntimeOtaPolicy,
  resolveScriptOtaPolicy,
} from '@/shared/script-ota-policy'

describe('script-ota-policy', () => {
  it('should default legacy scripts to stable auto-upgrade', () => {
    expect(resolveScriptOtaPolicy(undefined)).toEqual({ stage: 'stable', autoUpgrade: true })
  })

  it('should default new scripts to alpha without auto-upgrade', () => {
    expect(resolveScriptOtaPolicy(undefined, { isNewScript: true })).toEqual(NEW_SCRIPT_OTA_DEFAULTS)
  })

  it('should build release snapshot paths', () => {
    expect(buildReleaseSnapshotPath('demo.ts', '1.2.0')).toBe('releases/demo.ts@1.2.0')
    expect(isReleaseSnapshotPath('releases/demo.ts@1.2.0')).toBe(true)
    expect(isReleaseSnapshotPath('demo.ts')).toBe(false)
  })

  it('should summarize script policy for manifest', () => {
    const summary = buildScriptPolicySummary({
      filename: 'demo.ts',
      version: '1.0.0',
      ota: { stage: 'alpha', autoUpgrade: false },
    })
    expect(summary).toEqual({ stage: 'alpha', autoUpgrade: false, version: '1.0.0' })
  })

  it('should resolve runtime policy defaults', () => {
    expect(resolveRuntimeOtaPolicy(null, '0.2.0')).toMatchObject({
      stage: 'stable',
      autoUpgrade: true,
      projectVersion: '0.2.0',
      scriptLoadMode: 'aggregate',
    })
  })

  it('should resolve match-fallback scriptLoadMode when set in index', () => {
    expect(resolveRuntimeOtaPolicy({ scriptLoadMode: 'match-fallback' }, '0.2.0').scriptLoadMode).toBe('match-fallback')
  })
})
