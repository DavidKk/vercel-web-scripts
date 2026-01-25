/**
 * Calculate hash for file contents
 * @param files Record of file paths to content strings
 * @returns Promise that resolves to hash string
 */
export async function calculateFilesHash(files: Record<string, string>): Promise<string> {
  // Sort file keys to ensure consistent hash
  const sortedFiles = Object.keys(files).sort()
  const contentString = sortedFiles.map((file) => `${file}:${files[file]}`).join('|')

  // Use Web Crypto API to calculate SHA-256 hash
  const encoder = new TextEncoder()
  const data = encoder.encode(contentString)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Check if file is a TypeScript declaration file
 * @param file File path
 * @returns True if file is a declaration file
 */
export function isDeclarationFile(file: string): boolean {
  return file.endsWith('.d.ts')
}

/**
 * Files that should not be sent to dev mode
 */
export const CONFIG_FILES = ['package.json', 'tsconfig.json', 'typings.d.ts', '.gitignore', 'gitignore']
