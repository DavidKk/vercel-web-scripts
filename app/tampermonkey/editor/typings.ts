import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Load Tampermonkey type definitions from the gm-template directory
 * This function should only be called on the server side
 * @returns Type definitions as a string
 */
export function loadTampermonkeyTypings(): string {
  const filePath = join(process.cwd(), 'public', 'gm-template', 'editor-typings.d.ts')
  return readFileSync(filePath, 'utf-8')
}
