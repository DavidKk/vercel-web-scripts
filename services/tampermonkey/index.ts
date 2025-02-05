import { EXCLUDED_FILES } from '@/constants/file'

const OPEN_TAG = `// ==UserScript==`
const CLOSE_TAG = `// ==/UserScript==`

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

export interface CreateBannerParams {
  match: string[]
  scriptUrl: string
  version: string
}

export function createBanner({ match, scriptUrl, version }: CreateBannerParams) {
  const uri = new URL(scriptUrl)
  return (content: string) => {
    return `
// ==UserScript==
// @name         Web Script
// @namespace    http://tampermonkey.net/
// @version      ${version}
// @description  Download and evaluate a remote script
// @author       DavidJones
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vercel.com
// @downloadURL  ${scriptUrl}
// @updateURL    ${scriptUrl}
${match.map((m) => `// @match        ${m}`).join('\n')}
// @noframes
// @connect      ${uri.hostname}
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(async () => {
  'use strict'

  const DEBUG_KEY = '#DebugMode@WebScripts'

  const matchUrl = (pattern, url) => {
    const regexPattern = pattern.replace(/\\./g, '\\\\.').replace(/\\*/g, '.*')
    const regex = new RegExp(\`^\${regexPattern}$\`)
    return regex.test(url)
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
    const uri = new URL('${scriptUrl}')
    uri.pathname = ''

    window.open(uri.toString(), '_blank')
  })

  GM_registerMenuCommand('Toggle Debug Mode', () => {
    const enable = !isDebugMode()
    toggleDebug(enable)
    window.location.reload()
  })

  if (isDebugMode()) {
    const scriptUrl = '${scriptUrl.replace('.user.js', '')}?url=' + encodeURIComponent(window.location.href)
    const content = await fetchScript(scriptUrl)

    if (content) {
      const execute = new Function('window', content)
      execute(window)
      return
    }

    return
  }

  ${clearMeta(content)}
})()
`
  }
}

export interface CreateScriptParams extends Omit<CreateBannerParams, 'match'> {
  files: Record<string, string>
}

export function createUserScript({ scriptUrl, version, files }: CreateScriptParams) {
  const matches = new Set<string>()
  const parts = Array.from(
    (function* () {
      for (const [file, content] of Object.entries(files)) {
        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        if (!(meta.match && meta.source)) {
          continue
        }

        const match = Array.isArray(meta.match) ? meta.match : [meta.match]
        match.forEach((match) => matches.add(match))

        const clearedContent = clearMeta(content)
        yield `if(${JSON.stringify(match)}.some((m) => matchUrl(m, window.location.href))){${clearedContent}}`
      }
    })()
  )

  const withBanner = createBanner({ match: Array.from(matches), scriptUrl, version })
  const content = parts.join('\n')
  return withBanner(content).trim()
}
