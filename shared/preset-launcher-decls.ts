/**
 * Preset launcher variable declarations injected before preset body (`with(g){...}`).
 * Shared by Chrome extension launcher and CSP user-script fallback bridge.
 */

/** Declarations beyond {@link PRESET_VAR_NAMES} assigned on launcher sandbox `g`. */
export const PRESET_LAUNCHER_SANDBOX_DECL_NAMES = ['__GLOBAL__', '__VWS_SCRIPT_KEY__'] as const

/** Scalar values that can be inlined into preset launcher `var` declarations. */
export type PresetLauncherDeclValue = string | boolean | number

/**
 * Serialize a launcher decl initializer (JSON for strings; bare literals for boolean/number).
 * @param value Decl value
 * @returns JavaScript expression source
 */
function formatPresetLauncherDeclValue(value: PresetLauncherDeclValue): string {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  return JSON.stringify(value)
}

/**
 * Build one `var name = ...` line from optional literal map, else `g.name`.
 * @param name Identifier to declare
 * @param values Optional literal overrides (avoids depending on staged `g` properties)
 * @returns Declaration statement
 */
function buildPresetLauncherDeclLine(name: string, values?: Record<string, PresetLauncherDeclValue | undefined | null>): string {
  if (values && Object.prototype.hasOwnProperty.call(values, name)) {
    const raw = values[name]
    if (raw !== undefined && raw !== null && raw !== '') {
      return `var ${name} = ${formatPresetLauncherDeclValue(raw)};`
    }
  }
  return `var ${name} = g.${name};`
}

/**
 * Build `var ...` declarations for preset execution in launcher sandbox `g`.
 * Prefer literal `values` when known so CSP user-script injection does not depend on
 * staged window properties surviving until `chrome.userScripts.execute` runs.
 * @param presetVarNames Names copied from `g` or inlined (e.g. `__BASE_URL__`, `__SCRIPT_URL__`)
 * @param values Optional literal overrides for sandbox + preset globals
 * @returns Declaration block (no outer `with`)
 */
export function buildPresetLauncherDecls(presetVarNames: readonly string[], values?: Record<string, PresetLauncherDeclValue | undefined | null>): string {
  const lines = ['var __GLOBAL__ = g;', buildPresetLauncherDeclLine('__VWS_SCRIPT_KEY__', values), ...presetVarNames.map((name) => buildPresetLauncherDeclLine(name, values))]
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
