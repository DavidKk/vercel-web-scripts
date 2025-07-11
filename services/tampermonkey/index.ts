import { createHash } from 'crypto'
import { getGistInfo } from '@/services/gist'
import { clearMeta, extractMeta, prependMeta } from './meta'
import { DEFAULT_GRANTS, GRANTS } from './grant'
import { compileGMCore } from './compile'

export interface CreateBannerParams {
  grant: string[]
  scriptUrl: string
  version: string
}

export async function createBanner({ grant, scriptUrl, version }: CreateBannerParams) {
  const key = getTampermonkeyScriptKey()
  const uri = new URL(scriptUrl)
  const __BASE_URL__ = `${uri.protocol}//${uri.hostname}${uri.port ? ':' + uri.port : ''}`
  const __RULE_API_URL__ = `${__BASE_URL__}/api/tampermonkey/${key}/rule`
  const __RULE_MANAGER_URL__ = `${__BASE_URL__}/tampermonkey/rule`
  const __EDITOR_URL__ = `${__BASE_URL__}/tampermonkey/editor`
  const grants = Array.from(new Set(grant.concat(DEFAULT_GRANTS)))
  const coreScriptContents = await compileGMCore(__BASE_URL__)

  return (content: string) => {
    return `
// ==UserScript==
// @name         Web Script${process.env.NODE_ENV === 'development' ? '(dev)' : ''}
// @namespace    ${__BASE_URL__}
// @version      ${version}
// @description  Download and evaluate a remote script
// @author       Vercel Web Script
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vercel.com
// @downloadURL  ${scriptUrl}
// @updateURL    ${scriptUrl}
// @match        */*
// @noframes
// @connect      ${uri.hostname}
${grants.map((g) => `// @grant        ${g}`).join('\n')}
// ==/UserScript==

const __BASE_URL__ = '${__BASE_URL__}'
const __RULE_API_URL__ = '${__RULE_API_URL__}'
const __RULE_MANAGER_URL__ = '${__RULE_MANAGER_URL__}'
const __EDITOR_URL__ = '${__EDITOR_URL__}'
${coreScriptContents}

(async () => {
  'use strict'

  const DEBUG_KEY = '#DebugMode@WebScripts'

  const toggleDebug = (enable = true) => {
    sessionStorage.setItem(DEBUG_KEY, enable ? '1' : '0')
  }

  const isDebugMode = () => {
    const enable = sessionStorage.getItem(DEBUG_KEY)
    return enable === '1'
  }

  GM_registerMenuCommand('Edit Script', () => {
    window.open("${__EDITOR_URL__}", '_blank')
  })

  GM_registerMenuCommand('Update Script', () => {
    const url = '${scriptUrl}'
    url && window.open(url, '_blank')
  })

  GM_registerMenuCommand('Rule manager', () => {
    const url = '${__RULE_MANAGER_URL__}?url=' + encodeURIComponent(window.location.href) + '&t=' + Date.now()
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
    const scriptUrl = '${__BASE_URL__}/api/tampermonkey?t=' + Date.now() + '&url=' + encodeURIComponent(window.location.href)
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
