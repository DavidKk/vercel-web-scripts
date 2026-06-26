import { buildPresetLauncherDecls, buildPresetUiExecDecls, isLikelyPresetUiBundle, PRESET_LAUNCHER_SANDBOX_DECL_NAMES } from '@shared/preset-launcher-decls'

describe('preset-launcher-decls', () => {
  it('buildPresetLauncherDecls includes sandbox and preset globals', () => {
    const decls = buildPresetLauncherDecls(['__BASE_URL__', '__SCRIPT_URL__'])
    expect(decls).toContain('var __GLOBAL__ = g;')
    expect(decls).toContain('var __VWS_SCRIPT_KEY__ = g.__VWS_SCRIPT_KEY__;')
    expect(decls).toContain('var __BASE_URL__ = g.__BASE_URL__;')
    expect(decls).toContain('var __SCRIPT_URL__ = g.__SCRIPT_URL__;')
    expect(PRESET_LAUNCHER_SANDBOX_DECL_NAMES).toEqual(['__GLOBAL__', '__VWS_SCRIPT_KEY__'])
  })

  it('buildPresetUiExecDecls stages __GLOBAL__ and __VWS_CORE__ for optional UI eval', () => {
    const decls = buildPresetUiExecDecls()
    expect(decls).toContain('var __GLOBAL__ = global;')
    expect(decls).toContain('global.__GLOBAL__ = global;')
    expect(decls).toContain('var __VWS_CORE__ = global.__VWS_CORE__;')
  })

  it('isLikelyPresetUiBundle rejects stubs and accepts UI tags', () => {
    expect(isLikelyPresetUiBundle('')).toBe(false)
    expect(isLikelyPresetUiBundle('console.warn("missing");')).toBe(false)
    expect(isLikelyPresetUiBundle(`(${'x'.repeat(2000)})`)).toBe(false)
    expect(isLikelyPresetUiBundle(`(function(){${'x'.repeat(2000)} __VWS_CORE__ preset-ui })()`)).toBe(false)
    expect(isLikelyPresetUiBundle(`(function(){${'x'.repeat(2000)} e.register("preset-ui") })()`)).toBe(true)
    expect(isLikelyPresetUiBundle(`(function(){${'x'.repeat(2000)} e.register(\n  "preset-ui",\n  {}) })()`)).toBe(true)
  })
})
