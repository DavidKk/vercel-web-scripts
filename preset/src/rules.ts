import { formatCacheInventory, parseRulesCacheStats } from '@shared/cache-debug'

import { GME_debug, GME_fail } from '@/helpers/logger'
import { isShellNetworkEffectivelyEnabled } from '@/services/shell-network-settings'

const RULE_CACHE_KEY = '#RuleCache@WebScripts'

/** Global rules cache for matchRule; updated via setGlobalRules */
let globalRules: Array<{ wildcard?: string; script?: string }> = []

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

async function fetchRules() {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url: __RULE_API_URL__,
      onload: function (response) {
        try {
          if (!(200 <= response.status && response.status < 400)) {
            throw new Error('Failed to load rules:' + response.statusText)
          }

          const result = JSON.parse(response.responseText)
          if (!(result.code === 0)) {
            throw new Error('Failed to load rules:' + result.message)
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
        reject(new Error('Failed to load rules:' + error.message))
      },
    })
  })
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
      fetchAndCacheRules()
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

  return fetchAndCacheRules()
}
