const RULE_CACHE_KEY = '#RuleCache@WebScripts'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function matchUrl(pattern: string, url = window.location.href) {
  const regexPattern = pattern.replace(/([\.\?])/g, '\\$1').replace(/\*/g, '.*')
  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(url)
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

async function fetchAndCacheRules() {
  const rules = await fetchRules()
  try {
    GM_setValue(RULE_CACHE_KEY, JSON.stringify(rules))
  } catch (error) {
    const finalError = error instanceof Error ? error : typeof error === 'string' ? new Error(error) : new Error('Unknown error')
    GME_fail('Caching rules:', finalError.message)
  }

  return rules
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchRulesFromCache(refetch = false) {
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
