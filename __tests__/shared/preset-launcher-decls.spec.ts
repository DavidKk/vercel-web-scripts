import { buildPresetLauncherDecls, buildPresetUiExecDecls, isLikelyPresetUiBundle, PRESET_LAUNCHER_SANDBOX_DECL_NAMES } from '@shared/preset-launcher-decls'

describe('preset-launcher-decls', () => {
  it('should include sandbox and preset globals from g when values are omitted', () => {
    const decls = buildPresetLauncherDecls(['__BASE_URL__', '__SCRIPT_URL__'])
    expect(decls).toContain('var __GLOBAL__ = g;')
    expect(decls).toContain('var __VWS_SCRIPT_KEY__ = g.__VWS_SCRIPT_KEY__;')
    expect(decls).toContain('var __BASE_URL__ = g.__BASE_URL__;')
    expect(decls).toContain('var __SCRIPT_URL__ = g.__SCRIPT_URL__;')
    expect(PRESET_LAUNCHER_SANDBOX_DECL_NAMES).toEqual(['__GLOBAL__', '__VWS_SCRIPT_KEY__'])
  })

  it('should inline literal launcher values when provided', () => {
    const decls = buildPresetLauncherDecls(['__BASE_URL__', '__SCRIPT_URL__', '__IS_DEVELOP_MODE__'], {
      __VWS_SCRIPT_KEY__: 'abc123',
      __BASE_URL__: 'https://webscripts.example.com',
      __SCRIPT_URL__: 'https://webscripts.example.com/static/abc123/tampermonkey-remote.js',
      __IS_DEVELOP_MODE__: false,
    })
    expect(decls).toContain('var __VWS_SCRIPT_KEY__ = "abc123";')
    expect(decls).toContain('var __BASE_URL__ = "https://webscripts.example.com";')
    expect(decls).toContain('var __SCRIPT_URL__ = "https://webscripts.example.com/static/abc123/tampermonkey-remote.js";')
    expect(decls).toContain('var __IS_DEVELOP_MODE__ = false;')
    expect(decls).not.toContain('var __BASE_URL__ = g.__BASE_URL__;')
  })

  it('should fall back to g.name when a literal value is empty', () => {
    const decls = buildPresetLauncherDecls(['__BASE_URL__'], { __BASE_URL__: '' })
    expect(decls).toContain('var __BASE_URL__ = g.__BASE_URL__;')
  })

  it('should make inlined decls visible to a nested strict IIFE even when g lacks properties', () => {
    const decls = buildPresetLauncherDecls(['__BASE_URL__', '__SCRIPT_URL__'], {
      __VWS_SCRIPT_KEY__: 'key1',
      __BASE_URL__: 'https://example.com',
      __SCRIPT_URL__: 'https://example.com/static/key1/tampermonkey-remote.js',
    })
    const g: Record<string, unknown> = {}
    const presetCode = `(function(){
      "use strict";
      globalThis.__VWS_DECL_PROBE__ = {
        base: typeof __BASE_URL__ !== "undefined" ? String(__BASE_URL__) : "",
        key: typeof __VWS_SCRIPT_KEY__ !== "undefined" ? String(__VWS_SCRIPT_KEY__) : "",
        scriptUrl: typeof __SCRIPT_URL__ !== "undefined" ? String(__SCRIPT_URL__) : "",
      };
    })();`

    new Function('g', `with(g){\n${decls}\n${presetCode}\n}`)(g)
    expect((globalThis as Record<string, unknown>).__VWS_DECL_PROBE__).toEqual({
      base: 'https://example.com',
      key: 'key1',
      scriptUrl: 'https://example.com/static/key1/tampermonkey-remote.js',
    })
    delete (globalThis as Record<string, unknown>).__VWS_DECL_PROBE__
  })

  it('should stage __GLOBAL__ and __VWS_CORE__ for optional UI eval', () => {
    const decls = buildPresetUiExecDecls()
    expect(decls).toContain('var __GLOBAL__ = global;')
    expect(decls).toContain('global.__GLOBAL__ = global;')
    expect(decls).toContain('var __VWS_CORE__ = global.__VWS_CORE__;')
  })

  it('should reject stubs and accept UI tags for preset-ui bundles', () => {
    expect(isLikelyPresetUiBundle('')).toBe(false)
    expect(isLikelyPresetUiBundle('console.warn("missing");')).toBe(false)
    expect(isLikelyPresetUiBundle(`(${'x'.repeat(2000)})`)).toBe(false)
    expect(isLikelyPresetUiBundle(`(function(){${'x'.repeat(2000)} __VWS_CORE__ preset-ui })()`)).toBe(false)
    expect(isLikelyPresetUiBundle(`(function(){${'x'.repeat(2000)} e.register("preset-ui") })()`)).toBe(true)
    expect(isLikelyPresetUiBundle(`(function(){${'x'.repeat(2000)} e.register(\n  "preset-ui",\n  {}) })()`)).toBe(true)
  })
})
