import { createHash } from 'crypto'

import { SCRIPT_INDEX_FILE } from '@/constants/file'
import { fetchGist, getGistInfo } from '@/services/gist'
import type { ScriptFileMeta } from '@/services/scripts/gistScripts'
import { buildScriptFilesForBundleTrack } from '@/shared/script-bundle-track'
import { type ScriptBundleTrack } from '@/shared/script-ota-policy'

import { getRemoteScriptContent } from './createUserScript.server'

/** Bump when remote module wrapper / log scoping changes (invalidates cached tampermonkey-remote.js). */
export const REMOTE_SCRIPT_WRAPPER_VERSION = 2

/**
 * Compiled remote script body plus SHA-1 (same bytes as GET tampermonkey-remote.js).
 */
export interface RemoteScriptBundlePayload {
  /** Normalized LF script body */
  content: string
  /** SHA-1 hex of content */
  hash: string
  /** Track used to build this payload */
  track: ScriptBundleTrack
}

/**
 * Compile resolved Gist script files into a remote bundle payload.
 * @param files Filename → source
 * @param track Bundle track label
 * @param scriptBuiltAt Stable timestamp for log wrappers
 * @returns Payload or null when compile yields empty
 */
export async function compileRemoteScriptBundlePayload(files: Record<string, string>, track: ScriptBundleTrack, scriptBuiltAt: number): Promise<RemoteScriptBundlePayload | null> {
  const raw = await getRemoteScriptContent(files, { strictCompile: true, scriptBuiltAt })
  const content = `// vws-wrapper:${REMOTE_SCRIPT_WRAPPER_VERSION}\n// vws-track:${track}\n${raw.replace(/\r\n/g, '\n')}`
  if (!content.trim()) {
    return null
  }
  const hash = createHash('sha1').update(content, 'utf8').digest('hex')
  return { content, hash, track }
}

/**
 * Compile a single Gist script file into a remote module payload.
 * @param file Managed script filename
 * @param source Script source text
 * @param track Bundle track
 * @param scriptBuiltAt Stable timestamp for log wrappers
 */
export async function compileRemoteScriptModulePayload(file: string, source: string, track: ScriptBundleTrack, scriptBuiltAt: number): Promise<RemoteScriptBundlePayload | null> {
  return compileRemoteScriptBundlePayload({ [file]: source }, track, scriptBuiltAt)
}

/**
 * Fetch and compile one script module from Gist for the given track.
 * @param filename Managed script filename
 * @param track Bundle track
 */
export async function buildRemoteScriptModuleFromGist(filename: string, track: ScriptBundleTrack = 'stable'): Promise<RemoteScriptBundlePayload | null> {
  try {
    const { gistId, gistToken } = getGistInfo()
    const gist = await fetchGist({ gistId, gistToken })
    const gistFiles = Object.fromEntries(Object.entries(gist.files).map(([name, file]) => [name, { content: file.content }]))

    let scripts: ScriptFileMeta[] = []
    const indexContent = gistFiles[SCRIPT_INDEX_FILE]?.content
    if (indexContent) {
      try {
        const parsed = JSON.parse(indexContent) as { scripts?: ScriptFileMeta[] }
        scripts = Array.isArray(parsed.scripts) ? parsed.scripts : []
      } catch {
        scripts = []
      }
    }

    const script = scripts.find((row) => row.filename === filename)
    if (!script) {
      return null
    }
    const files = buildScriptFilesForBundleTrack([script], gistFiles, track)
    const source = files[filename]
    if (!source) {
      return null
    }
    const gistUpdatedAtMs = new Date(gist.updated_at).getTime()
    return compileRemoteScriptModulePayload(filename, source, track, gistUpdatedAtMs)
  } catch {
    return null
  }
}

/**
 * Fetch Gist, compile script files for the given track, return body + content hash.
 * @param track `stable` (default) or `alpha`
 * @returns Payload or null when Gist/config unavailable or compile yields empty
 */
export async function buildRemoteScriptBundleFromGist(track: ScriptBundleTrack = 'stable'): Promise<RemoteScriptBundlePayload | null> {
  try {
    const { gistId, gistToken } = getGistInfo()
    const gist = await fetchGist({ gistId, gistToken })
    const gistFiles = Object.fromEntries(Object.entries(gist.files).map(([name, file]) => [name, { content: file.content }]))

    let scripts: ScriptFileMeta[] = []
    const indexContent = gistFiles[SCRIPT_INDEX_FILE]?.content
    if (indexContent) {
      try {
        const parsed = JSON.parse(indexContent) as { scripts?: ScriptFileMeta[] }
        scripts = Array.isArray(parsed.scripts) ? parsed.scripts : []
      } catch {
        scripts = []
      }
    }

    const files = buildScriptFilesForBundleTrack(scripts, gistFiles, track)
    const gistUpdatedAtMs = new Date(gist.updated_at).getTime()
    return compileRemoteScriptBundlePayload(files, track, gistUpdatedAtMs)
  } catch {
    return null
  }
}

/**
 * Build stable and alpha remote bundles in one Gist read.
 * @returns Both payloads (either may be null)
 */
export async function buildRemoteScriptBundlesFromGist(): Promise<{
  stable: RemoteScriptBundlePayload | null
  alpha: RemoteScriptBundlePayload | null
}> {
  try {
    const { gistId, gistToken } = getGistInfo()
    const gist = await fetchGist({ gistId, gistToken })
    const gistFiles = Object.fromEntries(Object.entries(gist.files).map(([name, file]) => [name, { content: file.content }]))

    let scripts: ScriptFileMeta[]
    const indexContent = gistFiles[SCRIPT_INDEX_FILE]?.content
    if (indexContent) {
      const parsed = JSON.parse(indexContent) as { scripts?: ScriptFileMeta[] }
      scripts = Array.isArray(parsed.scripts) ? parsed.scripts : []
    } else {
      scripts = []
    }

    const gistUpdatedAtMs = new Date(gist.updated_at).getTime()
    const stableFiles = buildScriptFilesForBundleTrack(scripts, gistFiles, 'stable')
    const alphaFiles = buildScriptFilesForBundleTrack(scripts, gistFiles, 'alpha')

    const [stable, alpha] = await Promise.all([
      compileRemoteScriptBundlePayload(stableFiles, 'stable', gistUpdatedAtMs),
      compileRemoteScriptBundlePayload(alphaFiles, 'alpha', gistUpdatedAtMs),
    ])
    return { stable, alpha }
  } catch {
    return { stable: null, alpha: null }
  }
}
