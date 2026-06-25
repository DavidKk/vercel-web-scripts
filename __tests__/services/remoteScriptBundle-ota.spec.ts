import { buildScriptFilesForBundleTrack, resolveScriptSourceForBundleTrack } from '@/shared/script-bundle-track'

describe('remoteScriptBundle OTA tracks', () => {
  it('should exclude alpha scripts from stable bundle sources', () => {
    const script = {
      filename: 'demo.ts',
      ota: { stage: 'alpha' as const, autoUpgrade: false },
    }
    const gistFiles = { 'demo.ts': { content: scriptContent() } }
    expect(resolveScriptSourceForBundleTrack(script, gistFiles, 'stable')).toBeNull()
    expect(resolveScriptSourceForBundleTrack(script, gistFiles, 'alpha')).toBe(scriptContent())
  })

  it('should use locked release snapshot on stable track', () => {
    const script = {
      filename: 'demo.ts',
      ota: { stage: 'stable' as const, autoUpgrade: true, lockedVersion: '1.0.0' },
    }
    const gistFiles = {
      'demo.ts': { content: 'v2' },
      'releases/demo.ts@1.0.0': { content: 'v1' },
    }
    expect(resolveScriptSourceForBundleTrack(script, gistFiles, 'stable')).toBe('v1')
  })

  it('should build stable files map without alpha-only scripts', () => {
    const stable = { filename: 'a.ts', ota: { stage: 'stable' as const, autoUpgrade: true } }
    const alpha = { filename: 'b.ts', ota: { stage: 'alpha' as const, autoUpgrade: false } }
    const gistFiles = { 'a.ts': { content: 'A' }, 'b.ts': { content: 'B' } }
    expect(buildScriptFilesForBundleTrack([stable, alpha], gistFiles, 'stable')).toEqual({ 'a.ts': 'A' })
    expect(buildScriptFilesForBundleTrack([stable, alpha], gistFiles, 'alpha')).toEqual({ 'a.ts': 'A', 'b.ts': 'B' })
  })
})

function scriptContent(): string {
  return `// ==UserScript==
// @name Demo
// @version 1.0.0-alpha.1
// @match https://example.com/*
// ==/UserScript==
console.log('demo')
`
}
