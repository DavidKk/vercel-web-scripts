import { buildReleaseSnapshotPath, resolveScriptOtaPolicy, type ScriptBundleTrack, type ScriptOtaPolicy } from './script-ota-policy'

/** Minimal script row for bundle track resolution. */
export interface ScriptBundleSourceRow {
  filename: string
  ota?: Partial<ScriptOtaPolicy>
}

/**
 * Resolve Gist source content for one script row and bundle track.
 * @param script Script index metadata
 * @param gistFiles All Gist files
 * @param track Bundle track
 * @returns Source text or null when excluded from track
 */
export function resolveScriptSourceForBundleTrack(script: ScriptBundleSourceRow, gistFiles: Record<string, { content: string }>, track: ScriptBundleTrack): string | null {
  const ota = resolveScriptOtaPolicy(script.ota)

  if (track === 'stable' && ota.stage !== 'stable') {
    return null
  }

  if (ota.lockedVersion) {
    const snapshotPath = buildReleaseSnapshotPath(script.filename, ota.lockedVersion)
    const snapshot = gistFiles[snapshotPath]?.content
    if (snapshot) {
      return snapshot
    }
  }

  return gistFiles[script.filename]?.content ?? null
}

/**
 * Build the file map passed to the remote script compiler for a track.
 * @param scripts Script index rows
 * @param gistFiles All Gist files
 * @param track Bundle track
 * @returns Filename → source map
 */
export function buildScriptFilesForBundleTrack(scripts: ScriptBundleSourceRow[], gistFiles: Record<string, { content: string }>, track: ScriptBundleTrack): Record<string, string> {
  const files: Record<string, string> = {}
  for (const script of scripts) {
    const content = resolveScriptSourceForBundleTrack(script, gistFiles, track)
    if (content) {
      files[script.filename] = content
    }
  }
  return files
}
