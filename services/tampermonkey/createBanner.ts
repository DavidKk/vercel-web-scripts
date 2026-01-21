import { createHash } from 'crypto'

import { getGistInfo } from '@/services/gist'

import { compileMainScript, compileScripts, getCoreScriptsSource, getMainScriptSource, loadCoreUIsInline } from './gmCore'
import { DEFAULT_GRANTS, GRANTS } from './grant'
import { clearMeta } from './meta'

export interface CreateBannerParams {
  grant: string[]
  connect: string[]
  scriptUrl: string
  version: string
}

/**
 * Create banner for Tampermonkey script
 * Uses inline imports (?raw) to load static resources at build time
 * No runtime fetch needed, works in both Node.js and Edge Runtime
 * @param params Banner creation parameters
 * @returns Function that generates the final script content
 */
export function createBanner({ grant, connect, scriptUrl, version }: CreateBannerParams) {
  const key = getTampermonkeyScriptKey()
  const uri = new URL(scriptUrl)
  const { protocol, hostname, port } = uri
  const __BASE_URL__ = `${protocol}//${hostname}${port ? ':' + port : ''}`
  const __HMK_URL__ = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}${port ? ':' + port : ''}/_next/webpack-hmr`
  const __RULE_API_URL__ = `${__BASE_URL__}/api/tampermonkey/${key}/rule`
  const __RULE_MANAGER_URL__ = `${__BASE_URL__}/tampermonkey/rule`
  const __EDITOR_URL__ = `${__BASE_URL__}/tampermonkey/editor`
  const grants = Array.from(new Set(grant.concat(DEFAULT_GRANTS))).sort()

  // Load static resources using inline imports (no fetch needed)
  const uiScriptContents = loadCoreUIsInline()
  const coreScriptContents = compileScripts({
    ...getCoreScriptsSource(),
    ...uiScriptContents,
  })

  const grantsString = GRANTS.map((grant) => `...(typeof ${grant} !== 'undefined' ? { ${grant} } : {})`).join(',')
  const isDevelopMode = process.env.NODE_ENV === 'development'
  const hostnamePort = `${hostname}${port ? ':' + port : ''}`

  // Pre-compile main script with base variables (GIST scripts will be injected later)
  const mainScriptContents = compileMainScript(getMainScriptSource(), {
    __BASE_URL__,
    __RULE_API_URL__,
    __RULE_MANAGER_URL__,
    __EDITOR_URL__,
    __HMK_URL__,
    __SCRIPT_URL__: scriptUrl,
    __IS_DEVELOP_MODE__: isDevelopMode,
    __HOSTNAME_PORT__: hostnamePort,
    __GRANTS_STRING__: grantsString,
  })

  return (content: string) => {
    const clearMetaCode = clearMeta(content)
    // Replace the placeholder in executeGistScripts function body with actual GIST scripts code
    // The placeholder is inside the function body, so we replace it with the actual code
    const finalMainScriptContents = mainScriptContents.replace('__GIST_SCRIPTS_PLACEHOLDER__', clearMetaCode)

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
// @run-at       ${'document-start'}
${connect
  .sort()
  .map((c) => `// @connect      ${c}`)
  .join('\n')}
${grants
  .filter((g) => ['none'].some((n) => n !== g))
  .map((g) => `// @grant        ${g}`)
  .join('\n')}
// ==/UserScript==

${coreScriptContents}

${finalMainScriptContents}
`
  }
}

export function getTampermonkeyScriptKey() {
  const { gistId } = getGistInfo()
  return createHash('sha256').update(gistId).digest('hex')
}
