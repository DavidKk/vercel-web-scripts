/**
 * Wildcard URL match (same semantics as preset/src/rules.ts).
 */
export function matchUrl(pattern: string, url = ''): boolean {
  const regexPattern = pattern.replace(/([\.\?])/g, '\\$1').replace(/\*/g, '.*')
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(url)
}
