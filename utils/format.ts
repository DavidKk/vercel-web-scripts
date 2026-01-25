import babel from 'prettier/plugins/babel'
import estree from 'prettier/plugins/estree'
import html from 'prettier/plugins/html'
import markdown from 'prettier/plugins/markdown'
import postcss from 'prettier/plugins/postcss'
import typescript from 'prettier/plugins/typescript'
import { format } from 'prettier/standalone'

const PARSER_MAP: Record<string, string> = {
  typescript: 'typescript',
  javascript: 'babel',
  json: 'json',
  markdown: 'markdown',
  html: 'html',
  css: 'css',
  less: 'less',
  scss: 'scss',
}

/**
 * Format code using Prettier
 * @param code Code content
 * @param language Language (typescript, javascript, json)
 * @returns Formatted code
 */
export async function formatCode(code: string, language: string): Promise<string> {
  try {
    const parser = PARSER_MAP[language]
    if (!parser) {
      return code
    }

    // Normalize plugins for standalone Prettier (handles both ESM and CJS structures)
    const normalizePlugin = (p: any) => p?.default || p
    const plugins = [normalizePlugin(typescript), normalizePlugin(estree), normalizePlugin(babel), normalizePlugin(markdown), normalizePlugin(html), normalizePlugin(postcss)]

    return await format(code, {
      parser,
      plugins,
      semi: false,
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 180,
    })
  } catch (error) {
    /**
     * If formatting fails (e.g., Markdown not supported or invalid characters),
     * silently return the original code instead of throwing.
     */
    if (language === 'markdown') {
      return code
    }
    // eslint-disable-next-line no-console
    console.error('[Format] Failed to format code:', error)
    return code
  }
}
