/**
 * Tampermonkey-style @match URL pattern test (shared across WEB, preset, extension, server).
 * @param pattern Match pattern (may contain `*`)
 * @param url Page URL to test
 */
export function matchUrlPattern(pattern: string, url: string): boolean {
  const regexPattern = pattern.replace(/([\.\?])/g, '\\$1').replace(/\*/g, '.*')
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(url)
}
