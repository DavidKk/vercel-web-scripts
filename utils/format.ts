import * as estree from 'prettier/plugins/estree'
import * as typescript from 'prettier/plugins/typescript'
import { format } from 'prettier/standalone'

export function formatProjectName(name: string): string {
  return name
    .replace('vercel-', '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Format code using Prettier
 * @param code Code content
 * @param language Language (typescript, javascript, json)
 * @returns Formatted code
 */
export async function formatCode(code: string, language: string): Promise<string> {
  try {
    const parser = language === 'json' ? 'json' : 'typescript'
    return await format(code, {
      parser,
      plugins: [typescript as any, estree as any],
      semi: false,
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 180,
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[Format] Failed to format code:', error)
    return code
  }
}
