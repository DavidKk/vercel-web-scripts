const RULE_CACHE_KEY = '#RuleCache@WebScripts'

/** Global rules cache for matchRule; updated via setGlobalRules */
let globalRules: Array<{ wildcard?: string; script?: string }> = []

export function matchUrl(pattern: string, url = window.location.href) {
  const regexPattern = pattern.replace(/([\.\?])/g, '\\$1').replace(/\*/g, '.*')
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(url)
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
  const rules = await fetchRules()
  try {
    GM_setValue(RULE_CACHE_KEY, JSON.stringify(rules))
  } catch (error) {
    const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
    GME_fail('Caching rules:', finalError.message)
  }

  return rules
}

export async function fetchRulesFromCache(refetch = false) {
  const cached = GM_getValue(RULE_CACHE_KEY)
  if (cached) {
    if (refetch) {
      fetchAndCacheRules()
    }

    try {
      return JSON.parse(cached)
    } catch (error) {
      const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
      GME_fail('Parsing cached rules:', finalError.message)
    }
  }

  return fetchAndCacheRules()
}
