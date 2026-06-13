/** chrome.storage.local key for navigation guard policy. */
export const NAV_GUARD_POLICY_STORAGE_KEY = 'vws_navigation_guard_policy'

export type NavGuardMode = 'off' | 'log' | 'same-host' | 'same-site' | 'custom'

export type NavGuardPolicy = {
  enabled: boolean
  mode: NavGuardMode
  /** Glob patterns (`*`); checked before block patterns in `custom` mode. */
  allowUrlPatterns: string[]
  /** Glob patterns (`*`); used in `custom` mode. */
  blockUrlPatterns: string[]
}

export const DEFAULT_NAV_GUARD_POLICY: NavGuardPolicy = {
  enabled: true,
  mode: 'log',
  allowUrlPatterns: [],
  blockUrlPatterns: [],
}

export type NavGuardChannel = 'window.open' | 'click'

export type NavGuardEvaluation = {
  action: 'allow' | 'block' | 'log'
  reason: string
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.jp',
  'ne.jp',
  'or.jp',
  'com.cn',
  'net.cn',
  'org.cn',
  'com.hk',
  'co.kr',
  'com.tw',
])

/**
 * Approximate registrable domain (eTLD+1) for common public suffixes.
 * @param host Hostname without port
 */
export function getRegistrableDomain(host: string): string {
  const normalized = host.toLowerCase().replace(/\.$/, '')
  const parts = normalized.split('.').filter(Boolean)
  if (parts.length <= 1) {
    return normalized
  }
  const lastTwo = parts.slice(-2).join('.')
  if (parts.length >= 3 && MULTI_PART_PUBLIC_SUFFIXES.has(lastTwo)) {
    return parts.slice(-3).join('.')
  }
  return lastTwo
}

function matchUrlPattern(pattern: string, url: string): boolean {
  const trimmed = pattern.trim()
  if (!trimmed) {
    return false
  }
  if (trimmed.includes('*')) {
    const re = new RegExp(`^${trimmed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
    return re.test(url)
  }
  try {
    const parsed = new URL(url)
    const lower = trimmed.toLowerCase()
    if (lower.includes('://')) {
      return parsed.href.toLowerCase().startsWith(lower) || parsed.href.toLowerCase() === lower
    }
    const host = parsed.hostname.toLowerCase()
    if (host === lower || host.endsWith(`.${lower}`)) {
      return true
    }
    return parsed.pathname.toLowerCase().includes(lower) || parsed.href.toLowerCase().includes(`/${lower}`)
  } catch {
    return url.toLowerCase().includes(trimmed.toLowerCase())
  }
}

function parseHttpUrl(raw: string, base: string): URL | null {
  try {
    return new URL(raw, base)
  } catch {
    return null
  }
}

function isDangerousScheme(url: URL): boolean {
  const scheme = url.protocol.toLowerCase()
  return scheme === 'javascript:' || scheme === 'data:' || scheme === 'vbscript:'
}

/**
 * Decide whether an outbound navigation should proceed under the active policy.
 * @param currentUrl Page URL when the navigation was initiated
 * @param targetRaw Target URL string (may be relative)
 * @param policy Active navigation guard policy
 */
export function evaluateNavigation(currentUrl: string, targetRaw: string, policy: NavGuardPolicy): NavGuardEvaluation {
  if (!policy.enabled || policy.mode === 'off') {
    return { action: 'allow', reason: 'guard off' }
  }

  const target = parseHttpUrl(String(targetRaw ?? ''), currentUrl)
  if (!target) {
    return policy.mode === 'log' ? { action: 'log', reason: 'invalid url' } : { action: 'block', reason: 'invalid url' }
  }

  if (isDangerousScheme(target)) {
    return policy.mode === 'log' ? { action: 'log', reason: 'dangerous scheme' } : { action: 'block', reason: 'dangerous scheme' }
  }

  if (policy.mode === 'log') {
    return { action: 'log', reason: 'observe only' }
  }

  const current = parseHttpUrl(currentUrl, currentUrl)
  if (!current) {
    return { action: 'allow', reason: 'current url invalid' }
  }

  if (policy.mode === 'custom') {
    const targetHref = target.href
    for (const pattern of policy.allowUrlPatterns) {
      if (matchUrlPattern(pattern, targetHref)) {
        return { action: 'allow', reason: `allow pattern ${pattern}` }
      }
    }
    for (const pattern of policy.blockUrlPatterns) {
      if (matchUrlPattern(pattern, targetHref)) {
        return { action: 'block', reason: `block pattern ${pattern}` }
      }
    }
    if (policy.allowUrlPatterns.length > 0) {
      return { action: 'block', reason: 'custom allowlist miss' }
    }
    if (policy.blockUrlPatterns.length > 0) {
      return { action: 'block', reason: 'custom default block' }
    }
    return { action: 'allow', reason: 'custom default allow' }
  }

  if (policy.mode === 'same-host') {
    if (target.host.toLowerCase() === current.host.toLowerCase()) {
      return { action: 'allow', reason: 'same host' }
    }
    return { action: 'block', reason: `cross-host → ${target.host}` }
  }

  if (policy.mode === 'same-site') {
    const currentSite = getRegistrableDomain(current.hostname)
    const targetSite = getRegistrableDomain(target.hostname)
    if (currentSite === targetSite) {
      return { action: 'allow', reason: 'same registrable domain' }
    }
    return { action: 'block', reason: `cross-site ${currentSite} → ${targetSite}` }
  }

  return { action: 'allow', reason: 'unknown mode' }
}

/**
 * Parse persisted policy JSON with safe defaults.
 * @param raw Value from chrome.storage.local
 */
export function parseNavGuardPolicy(raw: unknown): NavGuardPolicy {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_NAV_GUARD_POLICY }
  }
  const row = raw as Partial<NavGuardPolicy>
  const mode = row.mode === 'off' || row.mode === 'log' || row.mode === 'same-host' || row.mode === 'same-site' || row.mode === 'custom' ? row.mode : DEFAULT_NAV_GUARD_POLICY.mode
  return {
    enabled: row.enabled !== false,
    mode,
    allowUrlPatterns: Array.isArray(row.allowUrlPatterns) ? row.allowUrlPatterns.filter((item): item is string => typeof item === 'string') : [],
    blockUrlPatterns: Array.isArray(row.blockUrlPatterns) ? row.blockUrlPatterns.filter((item): item is string => typeof item === 'string') : [],
  }
}
