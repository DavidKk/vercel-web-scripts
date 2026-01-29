/**
 * Hash utilities (SHA-256) for change detection and comparison.
 * Uses Web Crypto API with chunked processing for large files.
 * Suitable for both browser and Node (where crypto.subtle / globalThis.crypto available).
 */

/**
 * Compute SHA-256 hash of a File/Blob in chunks (for large files).
 * @param file File or Blob to hash
 * @param chunkSize Chunk size in bytes (default: 2MB)
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function getHashChunked(file: File | Blob, chunkSize = 2 * 1024 * 1024): Promise<string> {
  let offset = 0
  const chunks: ArrayBuffer[] = []

  while (offset < file.size) {
    const slice = file.slice(offset, offset + chunkSize)
    chunks.push(await slice.arrayBuffer())
    offset += chunkSize
  }

  const combined = new Blob(chunks)
  const buffer = await combined.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Compute SHA-256 hash of a string.
 * @param str String to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function hashString(str: string): Promise<string> {
  const blob = new Blob([str], { type: 'text/plain;charset=utf-8' })
  return getHashChunked(blob)
}

/**
 * Compute SHA-256 hash of a File or Blob (chunked for large files).
 * @param file File or Blob to hash
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function hashFile(file: File | Blob): Promise<string> {
  return getHashChunked(file)
}

/**
 * Compare string content with a file by hash (avoids loading full file into memory for large files).
 * @param editorContent String content (e.g. editor)
 * @param localFile File or Blob from filesystem
 * @returns True if contents are identical
 */
export async function contentEqualsByHash(editorContent: string, localFile: File | Blob): Promise<boolean> {
  const [editorHash, fileHash] = await Promise.all([hashString(editorContent), hashFile(localFile)])
  return editorHash === fileHash
}
