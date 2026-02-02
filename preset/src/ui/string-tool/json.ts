/** Format JSON with indentation. */
export function jsonFormat(str: string): string {
  try {
    const parsed = JSON.parse(str) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON'
  }
}

/** Minify JSON (single line). */
export function jsonMinify(str: string): string {
  try {
    const parsed = JSON.parse(str) as unknown
    return JSON.stringify(parsed)
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON'
  }
}
