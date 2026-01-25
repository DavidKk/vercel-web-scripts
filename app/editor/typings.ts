// Import type definitions from unified templates index
import { getEditorTypingsSource } from '@templates/index'

/**
 * Load Tampermonkey type definitions from the gm-template directory
 * Delegates to templates/index.ts for centralized resource management
 * Uses ?raw import to inline file content at build time
 * Works in both Node.js and Edge Runtime (no filesystem access needed)
 * @returns Type definitions as a string
 */
export function loadTampermonkeyTypings(): string {
  return getEditorTypingsSource()
}
