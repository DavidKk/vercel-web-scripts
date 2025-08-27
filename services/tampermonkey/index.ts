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

${coreScriptContents}

const WEB_SCRIPT_ID = GME_uuid()
const IS_REMOTE_SCRIPT = typeof __IS_REMOTE_EXECUTE__ === 'boolean' && __IS_REMOTE_EXECUTE__
const IS_DEVELOP_MODE = ${process.env.NODE_ENV === 'development'} && '${hostname}${port ? ':' + port : ''}' === window.location.hostname

const LOCAL_DEV_EVENT_KEY = 'files@web-script-dev'

function isLocalDevMode() {
  return !!GM_getValue(LOCAL_DEV_EVENT_KEY)
}

function getLocalDevHost() {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY)
  return response?.host || ''
}

function getLocalDevFiles() {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY)
  return response?.files || {}
}

function executeScript(content) {
  const execute = new Function('global', \`with(global){\${content}}\`)
  const grants = { ${GRANTS.map((grant) => `...(typeof ${grant} !== 'undefined' ? { ${grant} } : {})`).join(',')} }
  execute({ window, GME_preview, ...grants, __IS_REMOTE_EXECUTE__: true })
}

async function executeRemoteScript(url = '${scriptUrl}') {
  const content = await fetchScript(url)
  if (!content) {
    return
  }
  
  GME_ok('Remote script fetched successfully.')
  executeScript(content)
}

async function executeLocalScript() {
  if (!isLocalDevMode()) {
    return
  }

  const files = getLocalDevFiles()
  const content = await fetchCompileScript('${__BASE_URL__}', files)
  if (!content) {
    return
  }

  GME_ok('Local script fetched successfully.')
  executeScript(content)
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
  if (isLocalDevMode() && !IS_REMOTE_SCRIPT) {
    executeLocalScript()
    return
  }

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
  
  let isDevMode = false
  GM_registerMenuCommand('Local Dev Mode', async () => {
    const host = getLocalDevHost()
    if (host && host !== WEB_SCRIPT_ID) {
      GME_notification('Another dev mode is running.', 'error')
      return
    }

    const dirHandle = await window.showDirectoryPicker();
    await dirHandle.requestPermission({ mode: 'read' });

    GME_notification('Watching files. Leaving will stop dev mode.', 'success')
    isDevMode = true

    window.addEventListener('beforeunload', (event) => {
      event.preventDefault()
      event.returnValue = ''
    })

    window.addEventListener('unload', () => {
      GM_setValue(LOCAL_DEV_EVENT_KEY, null)
    })

    const files = {}
    const modifies = {}

    async function* walkDir(handle, relativePath = '') {
      for await (const [name, entry] of handle.entries()) {
        const currentPath = relativePath ? \`\${relativePath}/\${name}\` : name
        if (entry.kind === 'file' && name.endsWith('.ts')) {
          yield { entry, path: currentPath }
          continue
        }

        if (entry.kind === 'directory') {
          yield* walkDir(entry, currentPath)
          continue
        }
      }
    }

    async function pollFiles() {
      let hasModified = false
      let lastModified = 0

      for await (const { entry, path } of walkDir(dirHandle)) {
        const file = await entry.getFile()
        if (modifies[path] === file.lastModified) {
          continue
        }

        modifies[path] = file.lastModified
        files[path] = await file.text()

        lastModified = Math.max(lastModified, file.lastModified)
        hasModified = true
      }

      if (!hasModified) {
        return
      }

      GM_setValue(LOCAL_DEV_EVENT_KEY, { host: WEB_SCRIPT_ID, lastModified, files })
      GME_info('Local files modified, emitting reload event...')
    }

    setInterval(pollFiles, 5e3)
  })

  GM_addValueChangeListener(LOCAL_DEV_EVENT_KEY, (name, oldValue, newValue) => {
    if (isDevMode) {
      return
    }

    if (oldValue?.lastModified >= newValue?.lastModified) {
      return
    }

    const reload = () => {
      const isActive = !document.hidden && document.hasFocus()
      if (!isActive) {
        return false
      }

      GME_info('Local dev mode detected, reloading...')
      window.location.reload()
    }

    if (reload() === false) {
      GME_info('Local dev mode detected, waiting for tab to be active...')

      const onReload = () => {
        const isLocalDevMode = !!GM_getValue(LOCAL_DEV_EVENT_KEY)

        if (!isLocalDevMode) {
          GME_info('Local dev mode stopped.')
          document.removeEventListener('visibilitychange', onReload)
          window.removeEventListener('focus', onReload)
          return
        }

        reload()
      }

      document.addEventListener('visibilitychange', onReload)
      window.addEventListener('focus', onReload)
    }
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
