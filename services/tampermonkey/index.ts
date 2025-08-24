import { createHash } from 'crypto'
import { getGistInfo } from '@/services/gist'
import { clearMeta, extractMeta, prependMeta } from './meta'
import { DEFAULT_GRANTS, GRANTS } from './grant'
import { fetchCoreScripts, fetchCoreUIs, compileScripts } from './gmCore'

export interface CreateBannerParams {
  grant: string[]
  connect: string[]
  scriptUrl: string
  version: string
}

export async function createBanner({ grant, connect, scriptUrl, version }: CreateBannerParams) {
  const key = getTampermonkeyScriptKey()
  const uri = new URL(scriptUrl)
  const { protocol, hostname, port } = uri
  const __BASE_URL__ = `${protocol}//${hostname}${port ? ':' + port : ''}`
  const __HMK_URL__ = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}${port ? ':' + port : ''}/_next/webpack-hmr`
  const __RULE_API_URL__ = `${__BASE_URL__}/api/tampermonkey/${key}/rule`
  const __RULE_MANAGER_URL__ = `${__BASE_URL__}/tampermonkey/rule`
  const __EDITOR_URL__ = `${__BASE_URL__}/tampermonkey/editor`
  const grants = Array.from(new Set(grant.concat(DEFAULT_GRANTS)))
  const contents = await fetchCoreScripts(__BASE_URL__)
  const uiScriptContents = await fetchCoreUIs(__BASE_URL__)
  const coreScriptContents = await compileScripts({
    ...contents,
    ...uiScriptContents,
  })

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
${connect.map((c) => `// @connect      ${c}`).join('\n')}
${grants.map((g) => `// @grant        ${g}`).join('\n')}
// ==/UserScript==

const __BASE_URL__ = '${__BASE_URL__}'
const __RULE_API_URL__ = '${__RULE_API_URL__}'
const __RULE_MANAGER_URL__ = '${__RULE_MANAGER_URL__}'
const __EDITOR_URL__ = '${__EDITOR_URL__}'

const IS_REMOTE_SCRIPT = typeof __IS_REMOTE_EXECUTE__ === 'boolean' && __IS_REMOTE_EXECUTE__
const IS_DEVELOP_MODE = ${process.env.NODE_ENV === 'development'}

${coreScriptContents}

async function executeRemoteScript(url = '${scriptUrl}') {
  const { etag, content } = await fetchScript(url)
  if (!content) {
    return
  }

  GME_ok('Script fetched successfully', url)
  const execute = new Function('global', \`with(global){\${content}}\`)
  const grants = { ${GRANTS.map((grant) => `...(typeof ${grant} !== 'undefined' ? { ${grant} } : {})`).join(',')} }
  execute({ window, GME_preview, ...grants, __IS_REMOTE_EXECUTE__: true })
}

function watchHMRUpdates({ onOpen, onClose, onError, onUpdate }) {
  const ws = new WebSocket('${__HMK_URL__}')
  ws.addEventListener('open', () => {
    GME_ok('Connected to HMR WebSocket')

    onOpen && onOpen()
  })

  ws.addEventListener('close', async () => {
    GME_info('HMR WebSocket closed')

    onClose && onClose()
    setTimeout(() => watchHMRUpdates({ onOpen: onUpdate }), 3e3)
  })

  ws.addEventListener('error', () => {
    GME_fail('HMR WebSocket error')

    onError && onError()
  })

  ws.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data)
      switch (data.action) {
        case 'serverComponentChanges':
          onUpdate && onUpdate()
          break;

        case 'serverError':
        case 'error':
          GME_fail('HMR error:' + event.data)
          break;
      }
    } catch (err) {
      GME_fail('Non-JSON HMR message:', event.data)
    }
  })
}

async function main() {
  if (IS_DEVELOP_MODE && !IS_REMOTE_SCRIPT) {
    watchHMRUpdates({
      onUpdate: () => window.location.reload(),
    })

    GME_info('Development mode')
    executeRemoteScript()
    return
  }

  if (IS_REMOTE_SCRIPT) {
    GME_info('Executing remote script')
  }

  const rules = await fetchRulesFromCache()
  function matchRule(name, url = window.location.href) {
    return rules.some(({ wildcard, script }) => {
      if (script !== name) {
        return false
      }

      return wildcard && matchUrl(wildcard, url)
    })
  }

  ${clearMeta(content)}

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
    GME_notification('Rules refreshed successfully', 'success')
  })
}

main()
`
  }
}

export function getTampermonkeyScriptKey() {
  const { gistId } = getGistInfo()
  return createHash('sha256').update(gistId).digest('hex')
}

export { clearMeta, extractMeta, prependMeta }
