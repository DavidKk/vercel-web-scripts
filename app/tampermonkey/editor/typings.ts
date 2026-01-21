// Import type definitions using ?raw to inline file content at build time
import editorTypingsSource from '@templates/editor-typings.d.ts?raw'

/**
 * Load Tampermonkey type definitions from the gm-template directory
 * Uses ?raw import to inline file content at build time
 * Works in both Node.js and Edge Runtime (no filesystem access needed)
 * @returns Type definitions as a string
 */
export function loadTampermonkeyTypings(): string {
  return editorTypingsSource
}
