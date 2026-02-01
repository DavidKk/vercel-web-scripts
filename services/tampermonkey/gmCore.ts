import fs from 'fs'
import path from 'path'

const PRESET_BUNDLE_PATH = path.join(process.cwd(), 'preset/dist/preset.js')
const PRESET_MAP_PATH = path.join(process.cwd(), 'preset/dist/preset.js.map')

/**
 * Read pre-built preset bundle (preset/dist/preset.js).
 * Preset registers GME_* and other APIs on globalThis, then runs main();
 * GIST scripts are injected by replacing __GIST_SCRIPTS_PLACEHOLDER__ in the bundle.
 * @returns Preset bundle content as string
 * @throws If preset has not been built (run pnpm build:preset)
 */
export function getPresetBundle(): string {
  try {
    return fs.readFileSync(PRESET_BUNDLE_PATH, 'utf8')
  } catch (e) {
    throw new Error('Preset bundle not found. Run "pnpm build:preset" to build preset/dist/preset.js before generating the script.')
  }
}

/**
 * Read preset source map if present; used to inline into final userscript for debugging in Tampermonkey.
 * @returns preset.js.map content or null if not found
 */
export function getPresetBundleSourceMap(): string | null {
  try {
    if (fs.existsSync(PRESET_MAP_PATH)) {
      return fs.readFileSync(PRESET_MAP_PATH, 'utf8')
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Build sourceMappingURL comment with inline base64 map for appending to script.
 * @param mapContent preset.js.map content
 * @returns Comment line to append, or empty string if no map
 */
export function buildInlineSourceMapComment(mapContent: string | null): string {
  if (!mapContent) return ''
  const base64 = Buffer.from(mapContent, 'utf8').toString('base64')
  return `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}`
}

/**
 * Build variable declarations string to prepend before preset bundle.
 * Preset expects these globals to be in scope when it runs.
 */
export function buildPresetVariableDeclarations(variables: {
  __BASE_URL__: string
  __RULE_API_URL__: string
  __RULE_MANAGER_URL__: string
  __EDITOR_URL__: string
  __HMK_URL__: string
  __SCRIPT_URL__: string
  __IS_DEVELOP_MODE__: boolean
  __HOSTNAME_PORT__: string
  __GRANTS_STRING__: string
}): string {
  return `
const __BASE_URL__ = ${JSON.stringify(variables.__BASE_URL__)};
const __RULE_API_URL__ = ${JSON.stringify(variables.__RULE_API_URL__)};
const __RULE_MANAGER_URL__ = ${JSON.stringify(variables.__RULE_MANAGER_URL__)};
const __EDITOR_URL__ = ${JSON.stringify(variables.__EDITOR_URL__)};
const __HMK_URL__ = ${JSON.stringify(variables.__HMK_URL__)};
const __SCRIPT_URL__ = ${JSON.stringify(variables.__SCRIPT_URL__)};
const __IS_DEVELOP_MODE__ = ${variables.__IS_DEVELOP_MODE__};
const __HOSTNAME_PORT__ = ${JSON.stringify(variables.__HOSTNAME_PORT__)};
const __GRANTS_STRING__ = ${JSON.stringify(variables.__GRANTS_STRING__)};
// __IS_REMOTE_EXECUTE__ is not declared here so preset reads it from the execution context:
// - First load (Tampermonkey): undefined → IS_REMOTE_SCRIPT = false
// - Remote run (executeScript(global)): global.__IS_REMOTE_EXECUTE__ = true → IS_REMOTE_SCRIPT = true
`
}
