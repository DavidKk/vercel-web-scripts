/**
 * Script execution functions
 */

import { GME_debug, GME_fail, GME_info, GME_ok } from '../helpers/logger'
import { fetchScript } from '../scripts'
import { EDITOR_DEV_EVENT_KEY, getEditorDevHost, getLocalDevHost, isEditorDevMode, isLocalDevMode, LOCAL_DEV_EVENT_KEY } from './dev-mode'

/**
 * Execute script content using the real global (globalThis) so the script
 * sees preset APIs (matchRule, GME_*, etc.) and Tampermonkey GM_* APIs.
 * GM_* may be in script scope only; we merge them onto global so with(global) resolves them.
 * @param content Script content to execute
 */
function executeScript(content: string): void {
  const execute = new Function('global', `with(global){${content}}`)
  const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any)
  const grants = eval(`({ ${__GRANTS_STRING__} })`) as Record<string, unknown>
  const prev = (g as any).__IS_REMOTE_EXECUTE__
  try {
    Object.assign(g, grants, { __IS_REMOTE_EXECUTE__: true })
    execute(g)
  } finally {
    ;(g as any).__IS_REMOTE_EXECUTE__ = prev
  }
}

/**
 * Execute remote script from URL
 * @param url Script URL to fetch and execute
 */

async function executeRemoteScript(url: string = __SCRIPT_URL__): Promise<void> {
  const content = await fetchScript(url)
  if (!content) {
    return
  }

  GME_ok('Remote script fetched successfully.')
  executeScript(content)
}

/**
 * Execute local dev mode script
 */

async function executeLocalScript(): Promise<void> {
  if (!isLocalDevMode()) {
    return
  }

  // Get the host from cache (could be this tab or another tab)
  const host = getLocalDevHost()
  if (!host) {
    return
  }

  // Get files and compiled content from cache (stored by the host tab)
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { files?: Record<string, string>; compiledContent?: string } | null
  const files = response?.files || {}
  const compiledContent = response?.compiledContent

  if (Object.keys(files).length === 0) {
    return
  }

  // Compiled content is required - if not available, compilation failed on host side
  if (!compiledContent) {
    GME_fail('[Local Dev Mode] No compiled content available. Compilation may have failed on host side.')
    return
  }

  GME_ok('[Local Dev Mode] Local script ready, executing...')
  executeScript(compiledContent)
}

/**
 * Execute editor dev mode script
 * @returns True if script was executed, false if waiting for files
 */

async function executeEditorScript(): Promise<boolean> {
  if (!isEditorDevMode()) {
    return false
  }

  const host = getEditorDevHost()
  if (!host) {
    return false
  }

  // Get files and compiled content from GM_setValue (like Local Dev Mode)
  const response = GM_getValue(EDITOR_DEV_EVENT_KEY) as { files?: Record<string, string>; compiledContent?: string; lastModified?: number; _early?: boolean } | null
  const files = response?.files || {}
  const compiledContent = response?.compiledContent
  const lastModified = response?.lastModified || 0
  const isEarlyInit = response?._early || false

  if (Object.keys(files).length === 0) {
    if (isEarlyInit) {
      GME_info('[Editor Dev Mode] Early initialization detected, waiting for real files from editor...')
      return true // Return true to keep DEV MODE active, files will come later
    }
    return false
  }

  try {
    // Compiled content is required - if not available, wait for editor to send it
    if (!compiledContent) {
      if (isEarlyInit) {
        GME_info('[Editor Dev Mode] Early initialization - no compiled content yet. DEV MODE active, waiting for files...')
        return true // Keep DEV MODE active
      }
      GME_info('[Editor Dev Mode] No compiled content available yet. Waiting for editor to compile and send files...')
      return false
    }

    /**
     * Prevent re-executing the same editor build in a loop.
     * The editor host may broadcast the same payload multiple times (or multiple listeners may process it).
     * We only execute when lastModified advances.
     */
    const lastExecuted = (window as any).__WEB_SCRIPT_EDITOR_LAST_MODIFIED__ as number | undefined
    if (typeof lastExecuted === 'number' && lastExecuted >= lastModified) {
      GME_debug('[Editor Dev Mode] Editor script already executed, skipping. lastExecuted: ' + lastExecuted + ', lastModified: ' + lastModified)
      return true
    }
    ;(window as any).__WEB_SCRIPT_EDITOR_LAST_MODIFIED__ = lastModified

    GME_ok('[Editor Dev Mode] Executing editor script')
    executeScript(compiledContent)
    GME_ok('[Editor Dev Mode] Editor script executed successfully')
    return true
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    GME_fail('[Editor Dev Mode] Failed to execute editor script: ' + errorMessage)
    return false
  }
}

/**
 * Watch HMR updates via WebSocket
 * @param callbacks Callback functions for different events
 */

function watchHMRUpdates({ onOpen, onClose, onError, onUpdate }: { onOpen?: () => void; onClose?: () => void; onError?: () => void; onUpdate?: () => void }): void {
  const ws = new WebSocket(__HMK_URL__)
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
          break

        case 'serverError':
        case 'error':
          GME_fail('HMR error:' + event.data)
          break
      }
    } catch (err) {
      GME_fail('Non-JSON HMR message:', event.data)
    }
  })
}

export { executeEditorScript, executeLocalScript, executeRemoteScript, executeScript, watchHMRUpdates }
