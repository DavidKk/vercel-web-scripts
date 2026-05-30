/**
 * Helpers for cache inventory / debug logging (launcher + preset).
 */

export interface RulesCacheStats {
  ruleCount: number
  scriptCount: number
  scriptNames: string[]
}

/**
 * Shorten hash/etag for log lines.
 * @param value Hash or etag string
 * @param max Max visible length before ellipsis
 * @returns Truncated value or `(none)`
 */
export function shortCacheLabel(value: string, max = 16): string {
  if (!value || typeof value !== 'string') return '(none)'
  return value.length > max ? `${value.slice(0, max)}...` : value
}

/**
 * Count compiled GIST modules in a remote bundle body (`// file.js` markers).
 * @param content Remote script bundle text
 * @returns Number of module markers found
 */
export function countCompiledRemoteModules(content: string): number {
  if (!content) return 0
  return (content.match(/^\s*\/\/\s+[\w./-]+\.(?:js|ts)\s*$/gm) ?? []).length
}

/**
 * Parse cached RULE JSON into counts and script names.
 * @param raw Serialized rules from GM storage
 * @returns Rule and unique script name stats
 */
export function parseRulesCacheStats(raw: string | null | undefined): RulesCacheStats {
  if (!raw || typeof raw !== 'string') {
    return { ruleCount: 0, scriptCount: 0, scriptNames: [] }
  }
  try {
    const rules = JSON.parse(raw) as Array<{ script?: string }>
    if (!Array.isArray(rules)) {
      return { ruleCount: 0, scriptCount: 0, scriptNames: [] }
    }
    const names = new Set<string>()
    for (const rule of rules) {
      if (typeof rule?.script === 'string' && rule.script.trim()) {
        names.add(rule.script.trim())
      }
    }
    return {
      ruleCount: rules.length,
      scriptCount: names.size,
      scriptNames: [...names].sort(),
    }
  } catch {
    return { ruleCount: 0, scriptCount: 0, scriptNames: [] }
  }
}

/**
 * Build a single-line cache inventory message from key/value pairs.
 * @param parts Inventory fields
 * @returns Space-separated `key=value` string
 */
export function formatCacheInventory(parts: Record<string, string | number | boolean>): string {
  return Object.entries(parts)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}
