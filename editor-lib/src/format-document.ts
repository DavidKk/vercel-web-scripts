import type { EditorProfile } from '@/types'

/** Supported lightweight formatters (no Prettier). */
export type FormatKind = 'json' | 'css'

export type FormatDocumentResult = { ok: true; text: string } | { ok: false; error: string }

/**
 * Format JSON via native `JSON.parse` / `JSON.stringify`.
 * @param code Raw editor content
 */
export function formatJson(code: string): FormatDocumentResult {
  try {
    const parsed = JSON.parse(code)
    return { ok: true, text: `${JSON.stringify(parsed, null, 2)}\n` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * Basic CSS indentation for theme stylesheets (brace-based, not a full parser).
 * @param code Raw CSS/SCSS-ish content
 */
export function formatCssBasic(code: string): FormatDocumentResult {
  try {
    const prepared = code.replace(/\r\n/g, '\n').replace(/}\s*/g, '}\n').replace(/\{\s*/g, ' {\n').replace(/;\s*/g, ';\n')

    let indent = 0
    const tab = '  '
    const out: string[] = []

    for (const rawLine of prepared.split('\n')) {
      const line = rawLine.trim()
      if (!line) continue
      if (line.startsWith('}')) {
        indent = Math.max(0, indent - 1)
      }
      out.push(`${tab.repeat(indent)}${line}`)
      if (line.endsWith('{')) {
        indent += 1
      }
    }

    return { ok: true, text: out.length > 0 ? `${out.join('\n')}\n` : '\n' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * Map editor profile / file kind to a formatter when available.
 * JS/TS/HTML/Markdown are intentionally unsupported without Prettier.
 * @param profile Editor profile or explicit format kind
 * @param code Document content
 */
export function formatDocument(profile: EditorProfile | FormatKind, code: string): FormatDocumentResult {
  if (profile === 'json') {
    return formatJson(code)
  }
  if (profile === 'css') {
    return formatCssBasic(code)
  }
  return {
    ok: false,
    error: 'Format is only available for JSON and CSS in editor-lib v1 (no Prettier bundle).',
  }
}
