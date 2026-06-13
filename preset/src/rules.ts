import { formatCacheInventory, parseRulesCacheStats } from '@shared/cache-debug'
import { RULE_CACHE_KEY } from '@shared/runtime-cache-clear'

import { parseStaticKeyFromScriptUrl, readLauncherBaseUrl, readLauncherScriptKey, resolveLauncherScriptUrl, shortUrlLabel } from '@/helpers/launcher-script-url'
import { GME_debug, GME_fail } from '@/helpers/logger'
import { isShellNetworkEffectivelyEnabled } from '@/services/shell-network-settings'

/** Global rules cache for matchRule; updated via setGlobalRules */
let globalRules: Array<{ wildcard?: string; script?: string }> = []
const RULE_FETCH_RETRY_DELAYS_MS = [500, 1000] as const

export function matchUrl(pattern: string, url = window.location.href) {
  const regexPattern = pattern.replace(/([\.\?])/g, '\\$1').replace(/\*/g, '.*')
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(url)
}

/**
 * Read RULE cache stats from GM storage (for debug logging).
 * @returns Rule count and unique script names in cache
 */
export function getRulesCacheStats(): ReturnType<typeof parseRulesCacheStats> {
  const cached = GM_getValue(RULE_CACHE_KEY)
  return parseRulesCacheStats(typeof cached === 'string' ? cached : null)
}

function logRulesCacheDebug(source: 'hit' | 'miss' | 'network'): void {
  const stats = getRulesCacheStats()
  GME_debug(
    `[Rules] cache:${source} ${formatCacheInventory({
      rules: stats.ruleCount,
      scripts: stats.scriptCount,
      names: stats.scriptNames.slice(0, 8).join(',') || '(none)',
    })}`
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveRuleApiUrl(): string {
  try {
    if (typeof __RULE_API_URL__ !== 'undefined' && __RULE_API_URL__) {
      return String(__RULE_API_URL__).trim()
    }
  } catch {
    // __RULE_API_URL__ may be undeclared in some CSP fallback contexts.
  }
  const base = readLauncherBaseUrl()
  const key = readLauncherScriptKey() || parseStaticKeyFromScriptUrl(resolveLauncherScriptUrl()) || ''
  if (!base || !key) {
    return ''
  }
  return `${base}/api/tampermonkey/${encodeURIComponent(key)}/rule`
}

/**
 * Set global rules used by getMatchRule().
 * @param rules - Rules array from fetchRulesFromCache
 */
export function setGlobalRules(rules: Array<{ wildcard?: string; script?: string }>): void {
  globalRules = rules
}

/**
 * Return matchRule function for GIST scripts (matches script name and URL wildcard).
 * Must be assigned to (g as any).matchRule so dynamically compiled scripts can resolve it.
 * @returns matchRule(name, url?) => boolean
 */
export function getMatchRule(): (name: string, url?: string) => boolean {
  return function matchRule(name: string, url: string = window.location.href): boolean {
    return globalRules.some(({ wildcard, script }) => {
      if (script !== name) return false
      return !!(wildcard && matchUrl(wildcard, url))
    })
  }
}

async function fetchRulesOnce(url: string) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      onload: function (response) {
        try {
          if (!(200 <= response.status && response.status < 400)) {
            throw new Error(`Failed to load rules:${response.statusText || response.status} url=${shortUrlLabel(url, 120)}`)
          }

          const result = JSON.parse(response.responseText)
          if (!(result.code === 0)) {
            throw new Error(`Failed to load rules:${result.message} url=${shortUrlLabel(url, 120)}`)
          }

          const rules = result.data
          if (!Array.isArray(rules)) {
            throw new Error('Invalid rules format')
          }

          resolve(rules)
        } catch (error) {
          const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
          reject(new Error('Error executing load rules:' + finalError.message))
        }
      },
      onerror: function (error) {
        const message =
          error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message) : String(error)
        reject(new Error(`Failed to load rules:${message} url=${shortUrlLabel(url, 120)}`))
      },
    })
  })
}

async function fetchRules() {
  const url = resolveRuleApiUrl()
  if (!url) {
    throw new Error('Failed to load rules:missing rule API URL')
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= RULE_FETCH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      if (attempt > 0) {
        GME_debug(`[Rules] fetch:retry attempt=${attempt + 1} url=${shortUrlLabel(url, 120)}`)
      }
      return await fetchRulesOnce(url)
    } catch (error) {
      lastError = error
      const delayMs = RULE_FETCH_RETRY_DELAYS_MS[attempt]
      if (delayMs == null) {
        break
      }
      await sleep(delayMs)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function fetchAndCacheRules() {
  GME_debug('[Rules] fetch:network start')
  const rules = await fetchRules()
  try {
    GM_setValue(RULE_CACHE_KEY, JSON.stringify(rules))
    const stats = parseRulesCacheStats(JSON.stringify(rules))
    GME_debug(
      `[Rules] fetch:network cached ${formatCacheInventory({
        rules: stats.ruleCount,
        scripts: stats.scriptCount,
      })}`
    )
  } catch (error) {
    const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
    GME_fail('Caching rules:', finalError.message)
  }

  return rules
}

export async function fetchRulesFromCache(refetch = false) {
  const allowNetwork = isShellNetworkEffectivelyEnabled()
  const cached = GM_getValue(RULE_CACHE_KEY)
  if (cached) {
    logRulesCacheDebug('hit')
    if (refetch && allowNetwork) {
      GME_debug('[Rules] cache:hit background refetch scheduled')
      void fetchAndCacheRules().catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        GME_fail('[Rules] background refetch failed:', message)
      })
    }

    try {
      return JSON.parse(cached)
    } catch (error) {
      const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
      GME_fail('Parsing cached rules:', finalError.message)
    }
  }

  logRulesCacheDebug('miss')
  if (!allowNetwork) {
    GME_debug('[Rules] cache:miss network=off return empty rules')
    return []
  }

  try {
    return await fetchAndCacheRules()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    GME_fail('[Rules] fetch:failed', message, '(returning empty rules; sync rules from extension popup or retry when server is reachable)')
    return []
  }
}
