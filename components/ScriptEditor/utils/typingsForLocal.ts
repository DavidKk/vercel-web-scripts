'use client'

/**
 * Strip the "Browser File System Access API" declare global block from typings content.
 * When writing gm-globals.d.ts to local, we only want internal GM/GME types, not global
 * augmentation (which causes TS2669 in user projects).
 * @param typings Full editor typings string (may include declare global { Window; FileSystem* })
 * @returns Typings string without the File System Access API declare global block
 */
export function stripFileSystemAccessGlobalBlock(typings: string): string {
  const marker = 'Browser File System Access API'
  const idx = typings.indexOf(marker)
  if (idx === -1) return typings

  // Start of block: the /** comment that contains the marker
  const commentStart = typings.lastIndexOf('\n/**', idx)
  const start = commentStart !== -1 ? commentStart + 1 : typings.lastIndexOf('/**', idx)
  if (start === -1) return typings

  // Find "declare global {" after the marker
  const declareGlobal = typings.indexOf('declare global {', idx)
  if (declareGlobal === -1) return typings

  const openBrace = typings.indexOf('{', declareGlobal)
  if (openBrace === -1) return typings

  // Find matching closing brace
  let depth = 1
  let i = openBrace + 1
  while (i < typings.length && depth > 0) {
    const ch = typings[i]
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    i += 1
  }
  const end = i - 1
  if (depth !== 0) return typings

  // Remove from start of comment through closing }; trim trailing newlines from first part
  const before = typings.slice(0, start).replace(/\n+$/, '\n')
  const after = typings.slice(end + 1)
  return before + after
}
