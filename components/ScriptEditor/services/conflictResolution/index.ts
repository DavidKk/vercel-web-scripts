'use client'

/**
 * Conflict resolution service.
 * Generates merge content with Git-style conflict markers for two file versions.
 * One conflict block containing the full Editor content and full Local content (like Git).
 */

/** Git-style conflict marker labels */
const MARKER_OURS = '<<<<<<< Editor'
const MARKER_SEP = '======='
const MARKER_THEIRS = '>>>>>>> Local'

/**
 * Generate merged content with Git-style conflict markers.
 * The conflict block contains the complete Editor content and complete Local content,
 * so the user can resolve with full context in the file.
 * @param ours Editor / current content (full)
 * @param theirs Local file content (full)
 * @returns Single string: <<<<<<< Editor + full ours + ======= + full theirs + >>>>>>> Local
 */
export function generateConflictMarkers(ours: string, theirs: string): string {
  return `${MARKER_OURS}\n${ours}\n${MARKER_SEP}\n${theirs}\n${MARKER_THEIRS}\n`
}

/**
 * Check if content contains conflict markers (e.g. after resolving).
 * @param content File content
 * @returns True if any conflict marker is present
 */
export function hasConflictMarkers(content: string): boolean {
  return content.includes(MARKER_OURS) || content.includes(MARKER_SEP) || content.includes(MARKER_THEIRS)
}
