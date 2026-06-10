/**
 * Runtime guard injected into compiled GIST wrappers (extension shell only).
 * Tampermonkey pages omit `__VWS_ENABLED_SCRIPTS__`; unset entries default to enabled.
 * @param file Managed script filename (e.g. `table-copy-csv.ts`)
 * @returns JavaScript statements to prepend inside each module executor
 */
export function buildExtensionScriptEnabledGuard(file: string): string {
  return `
          var __vwsG = typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : {};
          if (__vwsG.__VWS_ENABLED_SCRIPTS__ && __vwsG.__VWS_ENABLED_SCRIPTS__[${JSON.stringify(file)}] === false) {
            return;
          }`
}
