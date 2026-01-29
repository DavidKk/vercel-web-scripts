'use client'

import { hashString } from '@/utils/hash'

/**
 * Local file map internal helpers.
 * Not exported from the service public API.
 */

/**
 * Get a file at the given relative path if it exists. Does not create anything.
 * @param root Root directory handle
 * @param relativePath Relative path (e.g. "src/utils.ts")
 * @returns The File if it exists, null otherwise
 */
export async function getFileAtPath(root: FileSystemDirectoryHandle, relativePath: string): Promise<File | null> {
  const parts = relativePath.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const fileName = parts.pop()!
  const dirPath = parts.join('/')
  try {
    const dir = dirPath ? await getDirectoryAtPath(root, dirPath) : root
    if (!dir) return null
    const fileHandle = await dir.getFileHandle(fileName, { create: false })
    const file = await (fileHandle as FileSystemFileHandle).getFile()
    return file
  } catch {
    return null
  }
}

/**
 * Get a directory handle at the given relative path if it exists. Does not create.
 */
async function getDirectoryAtPath(root: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemDirectoryHandle | null> {
  const parts = relativePath.split('/').filter(Boolean)
  let current: FileSystemDirectoryHandle = root
  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part, { create: false })
    } catch {
      return null
    }
  }
  return current
}

/**
 * Ensure a directory path exists under the root handle, creating subdirs if needed.
 * @param root Root directory handle
 * @param relativePath Relative path (e.g. "src/utils")
 * @returns Handle for the leaf directory
 */
export async function ensureDirectory(root: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemDirectoryHandle> {
  const parts = relativePath.split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true })
  }
  return current
}

/**
 * Read a single file and optionally compute its content hash.
 * @param handle File handle
 * @param path Logical path for logging
 * @param computeHash Whether to compute SHA-256 hash
 * @returns Content and optional hash, or null if read failed
 */
export async function processFile(handle: FileSystemFileHandle, path: string, computeHash: boolean): Promise<{ content: string; hash?: string } | null> {
  try {
    const file = await handle.getFile()
    const text = await file.text()
    if (computeHash) {
      const hash = await hashString(text)
      return { content: text, hash }
    }
    return { content: text }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[localFileMap] Failed to read file ${path}:`, err)
    return null
  }
}
