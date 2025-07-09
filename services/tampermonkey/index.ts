import { createHash } from 'crypto'
import { getGistInfo } from '@/services/gist'
import { clearMeta, extractMeta, prependMeta } from './meta'
import { DEFAULT_GRANTS, GRANTS } from './grant'

export interface CreateBannerParams {
  grant: string[]
  scriptUrl: string
  version: string
}

export function createBanner({ grant, scriptUrl, version }: CreateBannerParams) {
  const key = getTampermonkeyScriptKey()
  const uri = new URL(scriptUrl)
  const baseUrl = `${uri.protocol}//${uri.hostname}${uri.port ? ':' + uri.port : ''}`
  const ruleAPIUrl = `${baseUrl}/api/tampermonkey/${key}/rule`
  const ruleManagerUrl = `${baseUrl}/tampermonkey/rule`
  const editorUrl = `${baseUrl}/tampermonkey/editor`
  const grants = Array.from(new Set(grant.concat(DEFAULT_GRANTS)))

  return (content: string) => {
    return `
// ==UserScript==
// @name         Web Script${process.env.NODE_ENV === 'development' ? '(dev)' : ''}
// @namespace    ${baseUrl}
// @version      ${version}
// @description  Download and evaluate a remote script
// @author       DavidJones
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vercel.com
// @downloadURL  ${scriptUrl}
// @updateURL    ${scriptUrl}
// @match        */*
// @noframes
// @connect      ${uri.hostname}
${grants.map((g) => `// @grant        ${g}`).join('\n')}
// ==/UserScript==

(async () => {
  'use strict'

  const DEBUG_KEY = '#DebugMode@WebScripts'
  const RULE_CACHE_KEY = '#RuleCache@WebScripts'

  const GME_preview = (file, content) => {
    if (!file || !content) {
      throw new Error('Missing file or content')
    }

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '${baseUrl}/api/preview'
    form.target = '_blank'

    const fileInput = document.createElement('input')
    fileInput.type = 'hidden'
    fileInput.name = 'file'
    fileInput.value = file
    form.appendChild(fileInput)

    const contentInput = document.createElement('input')
    contentInput.type = 'hidden'
    contentInput.name = 'content'
    contentInput.value = content
    form.appendChild(contentInput)

    document.body.appendChild(form)
    form.submit()

    document.body.removeChild(form)
  }

  const matchUrl = (pattern, url = window.location.href) => {
    const regexPattern = pattern.replace(/\\./g, '\\\\.').replace(/\\*/g, '.*')
    const regex = new RegExp(\`^\${regexPattern}$\`)
    return regex.test(url)
  }

  const fetchRules = async () => {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: '${ruleAPIUrl}',
        onload: function (response) {
          try {
            if (!(200 <= response.status && response.status < 400)) {
              throw new Error('Failed to load rules:'+ response.statusText)
            }

            const result = JSON.parse(response.responseText)
            if (!(result.code === 0)) {
              throw new Error('Failed to load rules:'+ result.message)   
            }

            const rules = result.data
            if (!Array.isArray(rules)) {
              throw new Error('Invalid rules format')
            }

            resolve(rules)
          } catch (error) {
            reject(new Error('Error executing load rules:'+ error.message))
          }
        },
        onerror: function (error) {
          reject(new Error('Failed to load rules:' + error.message))
        }
      })
    })
  }
  
  const fetchAndCacheRules = async () => {
    const rules = await fetchRules()
    try {
      GM_setValue(RULE_CACHE_KEY, JSON.stringify(rules))
    } catch (error) {
      GM_log('[ERROR] Caching rules:', error)
    }

    return rules
  }

  const fetchRulesFromCache = async (refetch = false) => {
    const cached = GM_getValue(RULE_CACHE_KEY)
    if (cached) {
      if (refetch) {
        fetchAndCacheRules()
      }

      try {
        return JSON.parse(cached)
      } catch (error) {
        GM_log('[ERROR] Parsing cached rules:', error)
      }
    }

    return fetchAndCacheRules()
  }

  const fetchScript = async (scriptUrl) => {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: scriptUrl,
        onload: function (response) {
          try {
            if (!(200 <= response.status && response.status < 400)) {
              throw new Error('Failed to load remote script: ' + response.statusText)
            }

            const content = response.responseText
            resolve(content)
          } catch (error) {
            reject(new Error('Error executing remote script: ' + error.message))
          }
        },
        onerror: function (error) {
          reject(new Error('Failed to load remote script:' + error.message))
        }
      })
    })
  }

  const toggleDebug = (enable = true) => {
    sessionStorage.setItem(DEBUG_KEY, enable ? '1' : '0')
  }

  const isDebugMode = () => {
    const enable = sessionStorage.getItem(DEBUG_KEY)
    return enable === '1'
  }

  GM_registerMenuCommand('Edit Script', () => {
    window.open("${editorUrl}", '_blank')
  })

  GM_registerMenuCommand('Update Script', () => {
    const url = '${scriptUrl}'
    url && window.open(url, '_blank')
  })

  GM_registerMenuCommand('Rule manager', () => {
    const url = '${ruleManagerUrl}?url=' + encodeURIComponent(window.location.href) + '&t=' + Date.now()
    url && window.open(url, '_blank')
  })

  GM_registerMenuCommand('Refresh Rules', async () => {
    await fetchAndCacheRules()

    GM_notification({
      text: 'Rules refreshed successfully',
      title: 'Success',
      timeout: 3000,
    })
  })

  if (${process.env.NODE_ENV === 'development' ? 1 : 0}) {
    GM_registerMenuCommand(\`Toggle Debug Mode (\${isDebugMode() ? 'On' : 'Off'})\`, () => {
      const enable = !isDebugMode()
      toggleDebug(enable)
      window.location.reload()
    })
  }

  if (isDebugMode()) {
    const scriptUrl = '${baseUrl}/api/tampermonkey?t=' + Date.now() + '&url=' + encodeURIComponent(window.location.href)
    const content = await fetchScript(scriptUrl)

    if (content) {
      const execute = new Function('global', \`with(global){\${content}}\`)
      execute({
        window,
        GME_preview,
        ${GRANTS.map((grant) => `...(typeof ${grant} !== 'undefined' ? { ${grant} } : {})`).join(',')}
      })

      return
    }

    return
  }

  const rules = await fetchRulesFromCache()
  const matchRule = (name, url = window.location.href) => {
    return rules.some(({ wildcard, script }) => {
      if (script !== name) {
        return false
      }

      return wildcard && matchUrl(wildcard, url)
    })
  }

  ${clearMeta(content)}
})()
`
  }
}

export function getTampermonkeyScriptKey() {
  const { gistId } = getGistInfo()
  return createHash('sha256').update(gistId).digest('hex')
}

export { clearMeta, extractMeta, prependMeta }
