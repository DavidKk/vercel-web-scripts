import type { ScriptKeyBootstrapEntry } from '@ext/types'

/**
 * Merge per-scriptKey enable maps so explicit `false` wins across enabled scriptKeys.
 * @param entries Bootstrap entries for all enabled scriptKeys on this page
 * @returns Combined per-file enable flags for remote execution
 */
export function mergeScriptKeyEnabledScripts(entries: ScriptKeyBootstrapEntry[]): Record<string, boolean> {
  const merged: Record<string, boolean> = {}
  for (const entry of entries) {
    for (const [file, enabled] of Object.entries(entry.enabledScripts ?? {})) {
      if (enabled === false) {
        merged[file] = false
        continue
      }
      if (merged[file] !== false) {
        merged[file] = true
      }
    }
  }
  return merged
}
