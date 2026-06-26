'use server'

import { withAuthAction } from '@/initializer/wrapper'
import { fetchGist, getGistInfo } from '@/services/gist'
import { listManagedScriptFiles, lockManagedScriptVersion, publishManagedScriptStable, saveManagedScriptFiles, unlockManagedScriptVersion } from '@/services/scripts/gistScripts'

export const fetchFiles = withAuthAction(async () => {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })

  const files = Object.fromEntries(
    (function* () {
      for (const [filename, { content, raw_url: rawUrl }] of Object.entries(gist.files)) {
        yield [filename, { content, rawUrl }]
      }
    })()
  )

  return {
    files,
    updatedAt: new Date(gist.updated_at).getTime(),
  }
})

/**
 * Persist editor file writes and rebuild the managed script index.
 * @param files File writes (null content deletes)
 * @param options When `saveAsDebug` is true, managed scripts are marked alpha / no auto-upgrade
 */
export const saveScriptFiles = withAuthAction(async (files: Array<{ file: string; content: string | null }>, options?: { saveAsDebug?: boolean }) => {
  await saveManagedScriptFiles(files, options)
})

/**
 * Publish the active managed script to stable (releases snapshot + OTA policy).
 * @param filename Managed script filename
 */
export const publishScriptStable = withAuthAction(async (filename: string) => {
  return publishManagedScriptStable(filename)
})

/**
 * Fleet-lock a managed script to a semver (defaults to header @version).
 * @param filename Managed script filename
 * @param version Optional explicit version
 */
export const lockScriptVersion = withAuthAction(async (filename: string, version?: string) => {
  return lockManagedScriptVersion(filename, version)
})

/**
 * Remove fleet lock from a managed script.
 * @param filename Managed script filename
 */
export const unlockScriptVersion = withAuthAction(async (filename: string) => {
  return unlockManagedScriptVersion(filename)
})

/**
 * Read managed script index metadata (including OTA policy) for the editor.
 * @param filename Managed script filename
 */
export const fetchManagedScriptMeta = withAuthAction(async (filename: string) => {
  const { files } = await listManagedScriptFiles()
  return files.find((file) => file.filename === filename) ?? null
})
