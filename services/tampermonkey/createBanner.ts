import { createHash } from 'crypto'

import { getGistInfo } from '@/services/gist'

import { buildPresetVariableDeclarations, getPresetBundle } from './gmCore'
import { GRANTS } from './grant'
import { clearMeta } from './meta'

export interface CreateBannerParams {
  grant: string[]
  connect: string[]
  scriptUrl: string
  version: string
}

/**
 * Create banner for Tampermonkey script (inline-GIST path only; Launcher path does not use this).
 * Uses pre-built preset/dist/preset.js: preset runs first and registers GME_* etc. on globalThis,
 * then executeGistScripts() runs with GIST code. Preset content is read via getPresetBundle() (fs at request time).
 * @param params Banner creation parameters
 * @returns Promise of function that generates the final script content (banner + variables + presetWithGist)
 * @see docs/script-generation-flow.md
 */
export async function createBanner({ grant, connect, scriptUrl, version }: CreateBannerParams) {
  const key = getTampermonkeyScriptKey()
  const uri = new URL(scriptUrl)
  const { protocol, hostname, port } = uri
  const __BASE_URL__ = `${protocol}//${hostname}${port ? ':' + port : ''}`
  const __HMK_URL__ = `${protocol === 'https:' ? 'wss:' : 'ws:'}//${hostname}${port ? ':' + port : ''}/_next/webpack-hmr`
  const __RULE_API_URL__ = `${__BASE_URL__}/api/tampermonkey/${key}/rule`
  const __EDITOR_URL__ = `${__BASE_URL__}/editor`
  const grants = Array.from(new Set((grant || []).concat(GRANTS))).sort()

  const grantsString = GRANTS.map((g) => `...(typeof ${g} !== 'undefined' ? { ${g} } : {})`).join(',')
  const isDevelopMode = process.env.NODE_ENV === 'development'
  const hostnamePort = `${hostname}${port ? ':' + port : ''}`

  const variableDeclarations = buildPresetVariableDeclarations({
    __BASE_URL__,
    __RULE_API_URL__,
    __EDITOR_URL__,
    __HMK_URL__,
    __SCRIPT_URL__: scriptUrl,
    __IS_DEVELOP_MODE__: isDevelopMode,
    __HOSTNAME_PORT__: hostnamePort,
    __GRANTS_STRING__: grantsString,
  })

  let presetContent: string
  try {
    presetContent = await getPresetBundle()
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error('Preset 未构建，请先执行 pnpm run build:preset')
    }
    throw e
  }

  return (content: string) => {
    const clearMetaCode = clearMeta(content)
    const presetWithGist = presetContent.replace('__GIST_SCRIPTS_PLACEHOLDER__', clearMetaCode)

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

${variableDeclarations}
const __INLINE_GIST__ = true;
${presetWithGist}
`
  }
}

export function getTampermonkeyScriptKey() {
  const { gistId } = getGistInfo()
  return createHash('sha256').update(gistId).digest('hex')
}
