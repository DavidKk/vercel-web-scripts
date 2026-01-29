'use client'

/**
 * Local file map constants.
 * System/temporary file and directory names to ignore when syncing from local.
 */

/** System/temporary file and directory names to ignore when syncing from local */
export const IGNORED_SYNC_NAMES = new Set([
  '.DS_Store', // macOS
  'Thumbs.db', // Windows
  'desktop.ini', // Windows
  '.Spotlight-V100', // macOS
  '.Trashes', // macOS
  '__MACOSX', // macOS zip extraction
  '.crswap', // Cursor / editor swap file
])

/**
 * Returns true if the given file or directory name should be ignored (not synced).
 * @param name File or directory name
 * @returns True if the name should be skipped during sync
 */
export function shouldIgnoreSyncName(name: string): boolean {
  return IGNORED_SYNC_NAMES.has(name) || name.endsWith('.tmp') || name.endsWith('.temp') || name.endsWith('.crswap')
}
