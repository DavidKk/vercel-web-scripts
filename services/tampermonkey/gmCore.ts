import { readFile, stat } from 'fs/promises'
import { join } from 'path'

/** Preset variable names passed into preset at runtime (single source of truth for launcher and createBanner). */
export const PRESET_VAR_NAMES = [
  '__BASE_URL__',
  '__RULE_API_URL__',
  '__EDITOR_URL__',
  '__HMK_URL__',
  '__SCRIPT_URL__',
  '__IS_DEVELOP_MODE__',
  '__HOSTNAME_PORT__',
  '__GRANTS_STRING__',
] as const

/** Preset runtime variables (URLs, flags, grants string). */
export interface PresetVariables {
  __BASE_URL__: string
  __RULE_API_URL__: string
  __EDITOR_URL__: string
  __HMK_URL__: string
  __SCRIPT_URL__: string
  __IS_DEVELOP_MODE__: boolean
  __HOSTNAME_PORT__: string
  __GRANTS_STRING__: string
}

const PRESET_BUNDLE_PATH = join(process.cwd(), 'preset/dist/preset.js')
const PRESET_MANIFEST_PATH = join(process.cwd(), 'preset/dist/manifest.json')
let presetBundleCache: { mtimeMs: number; content: string } | null = null

/** Manifest shape written by preset/vite build (content hash for ETag / If-None-Match). */
export interface PresetManifest {
  file: string
  hash: string
}

/**
 * Read preset manifest (content hash). Returns null if not built.
 * @returns Promise of manifest or null
 */
export async function getPresetManifest(): Promise<PresetManifest | null> {
  try {
    const raw = await readFile(PRESET_MANIFEST_PATH, 'utf-8')
    return JSON.parse(raw) as PresetManifest
  } catch {
    return null
  }
}

/**
 * Load preset bundle by reading file at request time (no compile-time import).
 * Uses in-process cache invalidated by preset file mtime so rebuilds are picked up without restart.
 * Preset registers GME_* and other APIs on globalThis, then runs main();
 * GIST scripts are injected by replacing __GIST_SCRIPTS_PLACEHOLDER__ in the bundle.
 * File may not exist until after pnpm build:preset.
 * @returns Promise of preset bundle content as string
 */
export async function getPresetBundle(): Promise<string> {
  try {
    const st = await stat(PRESET_BUNDLE_PATH)
    if (presetBundleCache && presetBundleCache.mtimeMs === st.mtimeMs) {
      return presetBundleCache.content
    }
    const content = await readFile(PRESET_BUNDLE_PATH, 'utf-8')
    presetBundleCache = { mtimeMs: st.mtimeMs, content }
    return content
  } catch (e) {
    presetBundleCache = null
    throw e
  }
}

/**
 * Build variable declarations string to prepend before preset bundle.
 * Preset expects these globals to be in scope when it runs.
 */
export function buildPresetVariableDeclarations(variables: PresetVariables): string {
  return `
const __BASE_URL__ = ${JSON.stringify(variables.__BASE_URL__)};
const __RULE_API_URL__ = ${JSON.stringify(variables.__RULE_API_URL__)};
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

/**
 * Build global assignment statements for launcher: assign preset variables onto global object `g`.
 * Used when launcher evals preset so that preset code sees __BASE_URL__, __SCRIPT_URL__, etc.
 */
export function buildPresetGlobalAssignments(variables: PresetVariables): string {
  return `
g.__BASE_URL__ = ${JSON.stringify(variables.__BASE_URL__)};
g.__RULE_API_URL__ = ${JSON.stringify(variables.__RULE_API_URL__)};
g.__EDITOR_URL__ = ${JSON.stringify(variables.__EDITOR_URL__)};
g.__HMK_URL__ = ${JSON.stringify(variables.__HMK_URL__)};
g.__SCRIPT_URL__ = ${JSON.stringify(variables.__SCRIPT_URL__)};
g.__IS_DEVELOP_MODE__ = ${variables.__IS_DEVELOP_MODE__};
g.__HOSTNAME_PORT__ = ${JSON.stringify(variables.__HOSTNAME_PORT__)};
g.__GRANTS_STRING__ = ${JSON.stringify(variables.__GRANTS_STRING__)};
`.trim()
}
