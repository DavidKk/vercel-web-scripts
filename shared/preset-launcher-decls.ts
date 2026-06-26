/**
 * Preset launcher variable declarations injected before preset body (`with(g){...}`).
 * Shared by Chrome extension launcher and CSP user-script fallback bridge.
 */

/** Declarations beyond {@link PRESET_VAR_NAMES} assigned on launcher sandbox `g`. */
export const PRESET_LAUNCHER_SANDBOX_DECL_NAMES = ['__GLOBAL__', '__VWS_SCRIPT_KEY__'] as const

/**
 * Build `var ... = g....` declarations for preset execution in launcher sandbox `g`.
 * @param presetVarNames Names copied from `g` (e.g. `__BASE_URL__`, `__SCRIPT_URL__`)
 * @returns Declaration block (no outer `with`)
 */
export function buildPresetLauncherDecls(presetVarNames: readonly string[]): string {
  const lines = ['var __GLOBAL__ = g;', 'var __VWS_SCRIPT_KEY__ = g.__VWS_SCRIPT_KEY__;', ...presetVarNames.map((name) => `var ${name} = g.${name};`)]
  return lines.join('\n')
}

/**
 * Build optional preset-ui execute body prefix (`with(global){...}`).
 * @returns Single-line decl staging `__GLOBAL__` for UI bundle eval
 */
export function buildPresetUiExecDecls(): string {
  // Match preset-core launcher decls: `var __GLOBAL__` hoists to the user-script IIFE scope so
  // nested preset-ui bundle functions resolve the staged sandbox via closure (not only via with()).
  // Mirror __VWS_CORE__ for strict IIFE bundles that cannot see outer `var` bindings.
  return ['var __GLOBAL__ = global;', 'global.__GLOBAL__ = global;', 'var __VWS_CORE__ = global.__VWS_CORE__;', 'if (__VWS_CORE__) { global.__VWS_CORE__ = __VWS_CORE__; }'].join(
    '\n'
  )
}

/**
 * Heuristic: fetched body looks like the preset-ui IIFE bundle (not 404 HTML/JS stub).
 * @param content Response body
 */
export function isLikelyPresetUiBundle(content: string): boolean {
  if (!content || content.length < 1024) {
    return false
  }
  // Minified: e.register("preset-ui",{…}). Unminified (watch): .register(\n  "preset-ui", — allow whitespace.
  return /\.register\s*\(\s*['"]preset-ui['"]/.test(content)
}

/**
 * Heuristic: fetched body looks like the editor-lib IIFE bundle.
 * @param content Response body
 */
export function isLikelyEditorLibBundle(content: string): boolean {
  if (!content || content.length < 1024) {
    return false
  }
  return /\.register\s*\(\s*['"]editor-lib['"]/.test(content)
}

/**
 * Build optional editor-lib execute body prefix (`with(global){...}`).
 * @returns Single-line decl staging `__GLOBAL__` and script URL for iframe mode
 */
export function buildEditorLibExecDecls(scriptUrl?: string): string {
  const lines = ['var __GLOBAL__ = global;', 'global.__GLOBAL__ = global;']
  if (scriptUrl) {
    lines.push(`global.__VWS_EDITOR_LIB_SCRIPT_URL__ = ${JSON.stringify(scriptUrl)};`)
    lines.push(`if (typeof window !== 'undefined') { window.__VWS_EDITOR_LIB_SCRIPT_URL__ = ${JSON.stringify(scriptUrl)}; }`)
  }
  return lines.join('\n')
}

/**
 * Heuristic: fetched body looks like the explorer-lib IIFE bundle.
 * @param content Response body
 */
export function isLikelyExplorerLibBundle(content: string): boolean {
  if (!content || content.length < 512) {
    return false
  }
  return /\.register\s*\(\s*['"]explorer-lib['"]/.test(content)
}

/**
 * Build optional explorer-lib execute body prefix (`with(global){...}`).
 */
export function buildExplorerLibExecDecls(): string {
  return ['var __GLOBAL__ = global;', 'global.__GLOBAL__ = global;'].join('\n')
}
