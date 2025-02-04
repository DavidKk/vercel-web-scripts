import { EXCLUDED_FILES } from "@/constants/file"

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
  scriptUrl: string
  version: string
}

export function createBanner({ scriptUrl, version }: CreateBannerParams) {
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
// @match        *://*/*
// @noframes
// ==/UserScript==

function matchUrl(pattern, url) {
  const regexPattern = pattern.replace(/\\./g, '\\\\.').replace(/\\*/g, '.*')
  const regex = new RegExp(\`^\${regexPattern}$\`)
  return regex.test(url)
}`
}

export interface CreateScriptParams extends CreateBannerParams {
  files: Record<string, string>
}

export function createUserScript({ scriptUrl, version, files }: CreateScriptParams) {
  const parts = Array.from(function*(){
    for (const [file, content] of Object.entries(files)) {
      if (EXCLUDED_FILES.includes(file)) {
        continue
      }

      const meta = extractMeta(content)
      if (!(meta.match && meta.source)) {
        continue
      }
  
      yield `if(${JSON.stringify(meta.match)}.some((m) => matchUrl(m, window.location.href)))${content.trim()}`
    }
  }())

  const banner = createBanner({ scriptUrl, version })
  const content = parts.join('\n')
  return (banner + clearMeta(content)).trim()
}
