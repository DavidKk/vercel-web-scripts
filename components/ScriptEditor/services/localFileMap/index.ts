'use client'

import { shouldIgnoreSyncName } from './constants'
import { ensureDirectory, processFile } from './helpers'
import type { WindowWithPicker } from './types'

/**
 * Local file map service using File System Access API.
 * Handles authorization and read/write of editor content to a user-selected local directory.
 * Requires Chromium-based browsers (Chrome, Edge).
 * Used together with FileStateContext and IndexedDB (fileStorage) so that editor content
 * stays in sync: local ↔ fileState ↔ IndexedDB.
 */

/**
 * Check if the File System Access API (showDirectoryPicker) is supported.
 * Supported in Chromium-based browsers (Chrome, Edge). Not in Firefox/Safari.
 */
export function isLocalFileMapSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as WindowWithPicker).showDirectoryPicker === 'function'
}

/**
 * Request user to pick a local directory. Returns the handle or null if denied/cancelled.
 */
export async function requestLocalDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isLocalFileMapSupported()) {
    return null
  }
  try {
    const handle = await (window as unknown as WindowWithPicker).showDirectoryPicker!({
      mode: 'readwrite',
    })
    return handle as FileSystemDirectoryHandle
  } catch {
    return null
  }
}

/**
 * Write editor files to the selected local directory.
 * Creates subdirectories as needed (e.g. "src/utils.ts" -> src/utils.ts).
 * @param onProgress Optional callback (current, total) after each file written
 */
export async function writeFilesToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  files: Record<string, string>,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  const entries = Object.entries(files).filter(([path]) => {
    if (!path || path.trim() === '') {
      // eslint-disable-next-line no-console
      console.warn('[localFileMap] Skipping empty path')
      return false
    }
    return true
  })
  const total = entries.length
  let current = 0
  for (const [path, content] of entries) {
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[localFileMap] Skipping invalid path:', path)
      continue
    }
    const fileName = parts.pop()!
    const dirPath = parts.length > 0 ? parts.join('/') : ''
    const dir = dirPath ? await ensureDirectory(dirHandle, dirPath) : dirHandle
    try {
      const fileHandle = await dir.getFileHandle(fileName, { create: true })
      const writable = await (
        fileHandle as FileSystemFileHandle & {
          createWritable(): Promise<{
            write(data: string): Promise<void>
            close(): Promise<void>
          }>
        }
      ).createWritable()
      await writable.write(content)
      await writable.close()
      current += 1
      onProgress?.(current, total)
      // eslint-disable-next-line no-console
      console.log(`[localFileMap] Wrote file: ${path}`)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[localFileMap] Failed to write file ${path}:`, err)
      throw err
    }
  }
}

/**
 * Recursively collect all file entries (path + handle) under a directory.
 * Skips system/temporary files (see constants).
 */
async function collectFileEntries(dirHandle: FileSystemDirectoryHandle, basePath = ''): Promise<Array<{ path: string; handle: FileSystemFileHandle }>> {
  const list: Array<{ path: string; handle: FileSystemFileHandle }> = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (shouldIgnoreSyncName(name)) continue
    const path = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'file') {
      list.push({ path, handle: handle as FileSystemFileHandle })
    } else if (handle.kind === 'directory') {
      const nested = await collectFileEntries(handle as FileSystemDirectoryHandle, path)
      list.push(...nested)
    }
  }
  return list
}

/**
 * Recursively read all text files and compute content hashes.
 * Returns both contents and hashes so we only read each file once.
 * Skips system/temporary files (see constants).
 * @param onProgress Optional callback (current, total) after each file read
 */
export async function readFilesFromDirectoryWithHashes(
  dirHandle: FileSystemDirectoryHandle,
  basePath = '',
  onProgress?: (current: number, total: number) => void
): Promise<{ contents: Record<string, string>; hashes: Record<string, string> }> {
  const entries = await collectFileEntries(dirHandle, basePath)
  const total = entries.length
  const contents: Record<string, string> = {}
  const hashes: Record<string, string> = {}
  let current = 0
  for (const { path, handle } of entries) {
    const result = await processFile(handle, path, true)
    if (result) {
      contents[path] = result.content
      if (result.hash) hashes[path] = result.hash
    }
    current += 1
    onProgress?.(current, total)
  }
  return { contents, hashes }
}

/**
 * Recursively read all text files from a directory into a path -> content map.
 * Paths are relative to the root (e.g. "main.ts", "src/utils.ts").
 * Skips system/temporary files (see constants).
 */
export async function readFilesFromDirectory(dirHandle: FileSystemDirectoryHandle, basePath = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for await (const [name, handle] of dirHandle.entries()) {
    if (shouldIgnoreSyncName(name)) continue
    const path = basePath ? `${basePath}/${name}` : name
    if (handle.kind === 'file') {
      const fileResult = await processFile(handle as FileSystemFileHandle, path, false)
      if (fileResult) result[path] = fileResult.content
    } else if (handle.kind === 'directory') {
      const nested = await readFilesFromDirectory(handle as FileSystemDirectoryHandle, path)
      Object.assign(result, nested)
    }
  }
  return result
}

/**
 * Get a file at the given relative path under the directory if it exists.
 * @param dirHandle Root directory handle
 * @param relativePath Relative path (e.g. "src/utils.ts")
 * @returns The File if it exists, null otherwise
 */
export { getFileAtPath } from './helpers'

// Re-export constants for consumers that need the ignore list or helper
export { IGNORED_SYNC_NAMES, shouldIgnoreSyncName } from './constants'
