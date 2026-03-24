import { EXCLUDED_FILES, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { fetchGist, getGistInfo, readGistFile, writeGistFiles } from '@/services/gist'

/** Metadata for one script file in the backing Gist */
export interface ScriptFileMeta {
  /** File name in the Gist */
  filename: string
  /** UTF-8 byte length of content */
  byteLength: number
}

/** Result of listing script files */
export interface ListScriptFilesResult {
  /** Script files eligible for integration CRUD */
  files: ScriptFileMeta[]
  /** Gist `updated_at` as epoch ms */
  gistUpdatedAt: number
}

/**
 * Whether a Gist filename is allowed for script integration (mutations).
 * @param filename Gist file name
 * @returns True when list/get/upsert/delete are permitted
 */
export function isManagedScriptFilename(filename: string): boolean {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false
  }
  if (EXCLUDED_FILES.includes(filename)) {
    return false
  }
  return SCRIPTS_FILE_EXTENSION.some((ext) => filename.endsWith(ext))
}

/**
 * List managed script files from the configured Gist.
 * @returns File names and sizes (not full content)
 */
export async function listManagedScriptFiles(): Promise<ListScriptFilesResult> {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const files: ScriptFileMeta[] = []

  for (const [filename, { content }] of Object.entries(gist.files)) {
    if (!isManagedScriptFilename(filename)) {
      continue
    }
    files.push({ filename, byteLength: Buffer.byteLength(content, 'utf8') })
  }

  files.sort((a, b) => a.filename.localeCompare(b.filename))

  return {
    files,
    gistUpdatedAt: new Date(gist.updated_at).getTime(),
  }
}

/**
 * Read one managed script file from the Gist.
 * @param filename Gist file name
 * @returns File content
 */
export async function getManagedScriptFile(filename: string): Promise<{ filename: string; content: string }> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  const { gistId, gistToken } = getGistInfo()
  const content = await readGistFile({ gistId, gistToken, fileName: filename })
  return { filename, content }
}

/**
 * Create or replace a managed script file in the Gist.
 * @param filename Gist file name
 * @param content New file body
 */
export async function upsertManagedScriptFile(filename: string, content: string): Promise<void> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  const { gistId, gistToken } = getGistInfo()
  await writeGistFiles({ gistId, gistToken, files: [{ file: filename, content }] })
}

/**
 * Remove a managed script file from the Gist.
 * @param filename Gist file name
 */
export async function deleteManagedScriptFile(filename: string): Promise<void> {
  if (!isManagedScriptFilename(filename)) {
    throw new Error('File is not a managed script path')
  }
  const { gistId, gistToken } = getGistInfo()
  await writeGistFiles({ gistId, gistToken, files: [{ file: filename, content: null }] })
}
