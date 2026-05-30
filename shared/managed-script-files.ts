/** Gist entry launcher (generated). */
export const ENTRY_SCRIPT_FILE = 'tampermonkey.user.js'

/** Gist RULE config (not a userscript). */
export const ENTRY_SCRIPT_RULES_FILE = 'tampermonkey.rules.json'

/** Generated script index for search / MCP. */
export const SCRIPT_INDEX_FILE = 'magickmonkey.scripts.index.json'

export const EXCLUDED_FILES = [ENTRY_SCRIPT_FILE, ENTRY_SCRIPT_RULES_FILE]

export const SCRIPTS_FILE_EXTENSION = ['.ts', '.js'] as const

/**
 * Whether a Gist filename is a managed userscript (not entry, rules, or index).
 * @param filename Gist file name
 */
export function isManagedScriptFilename(filename: string): boolean {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false
  }
  if (EXCLUDED_FILES.includes(filename) || filename === SCRIPT_INDEX_FILE) {
    return false
  }
  return SCRIPTS_FILE_EXTENSION.some((ext) => filename.endsWith(ext))
}
