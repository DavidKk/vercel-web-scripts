import { createHash } from 'crypto'
import { getGistInfo } from '@/services/gist'
import { EXCLUDED_FILES } from '@/constants/file'
import * as prettier from 'prettier'

const OPEN_TAG = `// ==UserScript==`
const CLOSE_TAG = `// ==/UserScript==`

const PRETTIER_CONFIG: prettier.Options = {
  parser: 'babel',
  printWidth: 180,
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  semi: false,
  trailingComma: 'es5',
  bracketSpacing: true,
}

export function extractMeta(content: string) {
  const openTagIndex = content.indexOf(OPEN_TAG)
  const closeTagIndex = content.indexOf(CLOSE_TAG)

  if (openTagIndex === -1 || closeTagIndex === -1) {
    return {}
  }

  const metaContent = content.slice(openTagIndex + OPEN_TAG.length, closeTagIndex).trim()
  const meta: Record<string, string | string[]> = {}
  for (const line of metaContent.split('\n')) {
    const content = line.trim().replace(/^\/\//, '').trim()
    const [key, ...parts] = content.split(/\s+/)
    if (key.charAt(0) !== '@') {
      continue
    }

    const name = key.slice(1).trim()
    const value = parts.join(' ')
    const text = typeof value === 'string' ? value.trim() : ''

    if (meta[name]) {
      meta[name] = Array.isArray(meta[name]) ? [...meta[name], text] : [meta[name], text]
      continue
    }

    meta[name] = text
  }

  return meta
}

export function prependMeta(content: string, info: Record<string, string | string[]>) {
  const remarks = Object.entries(info).map(([key, value]) => {
    if (Array.isArray(value)) {
      return value.map((v) => `// @${key} ${v}`).join('\n')
    }

    return `// @${key} ${value}`
  })

  if (!Array.isArray(remarks) || remarks.length === 0) {
    return content
  }

  return [OPEN_TAG, ...remarks, CLOSE_TAG, '', clearMeta(content)].join('\n')
}

export function clearMeta(content: string) {
  while (true) {
    const openTagIndex = content.indexOf(OPEN_TAG)
    const closeTagIndex = content.indexOf(CLOSE_TAG)

    if (openTagIndex === -1 || closeTagIndex === -1) {
      break
    }

    content = content.slice(0, openTagIndex) + content.slice(closeTagIndex + CLOSE_TAG.length)
  }

  return content.trim()
}

export interface CreateScriptParams {
  files: Record<string, string>
  scriptUrl: string
  version: string
}

export async function createUserScript({ scriptUrl, version, files }: CreateScriptParams) {
  const matches = new Set<string>()
  const grants = new Set<string>()
  const parts = Array.from(
    (function* () {
      for (const [file, content] of Object.entries(files)) {
        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        if (!meta.match) {
          continue
        }

        const match = Array.isArray(meta.match) ? meta.match : [meta.match]
        match.forEach((match) => typeof match === 'string' && match && matches.add(match))

        if (meta.grant) {
          const grant = Array.isArray(meta.grant) ? meta.grant : [meta.grant]
          grant.forEach((grant) => typeof grant === 'string' && grant && grants.add(grant))
        }

        const clearedContent = clearMeta(content)
        yield `if(${JSON.stringify(match)}.some((m) => matchUrl(m)) || matchRule("${file}")){${clearedContent}}`
      }
    })()
  )

  const grant = Array.from(grants)
  const withBanner = createBanner({ grant, scriptUrl, version })
  const content = parts.join('\n\n')
  const script = withBanner(content).trim()
  return prettier.format(script, PRETTIER_CONFIG)
}

export interface CreateBannerParams {
  grant: string[]
  scriptUrl: string
  version: string
}

export function createBanner({ grant, scriptUrl, version }: CreateBannerParams) {
  const uri = new URL(scriptUrl)
  const baseUrl = `${uri.protocol}//${uri.hostname}${uri.port ? ':' + uri.port : ''}`
  const ruleAPIUrl = `${baseUrl}/api/tampermonkey/rule`
  const ruleManagerUrl = `${baseUrl}/tampermonkey/rule`
  const editorUrl = `${baseUrl}/tampermonkey/editor`
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
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_getValue
// @grant        GM_setValue
${grant.map((g) => `// @grant        ${g}`).join('\n')}
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
      console.error('Error caching rules:', error)
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
        console.error('Error parsing cached rules:', error)
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

  GM_registerMenuCommand(\`Toggle Debug Mode (\${isDebugMode() ? 'On' : 'Off'})\`, () => {
    const enable = !isDebugMode()
    toggleDebug(enable)
    window.location.reload()
  })

  if (isDebugMode()) {
    const scriptUrl = '${baseUrl}/api/tampermonkey?t=' + Date.now() + '&url=' + encodeURIComponent(window.location.href)
    const content = await fetchScript(scriptUrl)

    if (content) {
      const execute = new Function('global', \`with(global){\${content}}\`)
      execute({
        window,
        GME_preview,
        ...(typeof GM_addElement !== 'undefined' ? { GM_addElement } : {}),
        ...(typeof GM_addStyle !== 'undefined' ? { GM_addStyle } : {}),
        ...(typeof GM_download !== 'undefined' ? { GM_download } : {}),
        ...(typeof GM_getResourceText !== 'undefined' ? { GM_getResourceText } : {}),
        ...(typeof GM_getResourceURL !== 'undefined' ? { GM_getResourceURL } : {}),
        ...(typeof GM_info !== 'undefined' ? { GM_info } : {}),
        ...(typeof GM_log !== 'undefined' ? { GM_log } : {}),
        ...(typeof GM_notification !== 'undefined' ? { GM_notification } : {}),
        ...(typeof GM_openInTab !== 'undefined' ? { GM_openInTab } : {}),
        ...(typeof GM_registerMenuCommand !== 'undefined' ? { GM_registerMenuCommand } : {}),
        ...(typeof GM_unregisterMenuCommand !== 'undefined' ? { GM_unregisterMenuCommand } : {}),
        ...(typeof GM_setClipboard !== 'undefined' ? { GM_setClipboard } : {}),
        ...(typeof GM_getTab !== 'undefined' ? { GM_getTab } : {}),
        ...(typeof GM_saveTab !== 'undefined' ? { GM_saveTab } : {}),
        ...(typeof GM_getTabs !== 'undefined' ? { GM_getTabs } : {}),
        ...(typeof GM_setValue !== 'undefined' ? { GM_setValue } : {}),
        ...(typeof GM_getValue !== 'undefined' ? { GM_getValue } : {}),
        ...(typeof GM_deleteValue !== 'undefined' ? { GM_deleteValue } : {}),
        ...(typeof GM_listValues !== 'undefined' ? { GM_listValues } : {}),
        ...(typeof GM_setValues !== 'undefined' ? { GM_setValues } : {}),
        ...(typeof GM_getValues !== 'undefined' ? { GM_getValues } : {}),
        ...(typeof GM_deleteValues !== 'undefined' ? { GM_deleteValues } : {}),
        ...(typeof GM_addValueChangeListener !== 'undefined' ? { GM_addValueChangeListener } : {}),
        ...(typeof GM_removeValueChangeListener !== 'undefined' ? { GM_removeValueChangeListener } : {}),
        ...(typeof GM_xmlhttpRequest !== 'undefined' ? { GM_xmlhttpRequest } : {}),
        ...(typeof GM_webRequest !== 'undefined' ? { GM_webRequest } : {}),
        ...(typeof GM_cookie !== 'undefined' ? { GM_cookie } : {}),
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
