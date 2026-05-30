/**
 * Script execution functions
 */

import { countCompiledRemoteModules, formatCacheInventory, shortCacheLabel } from '@shared/cache-debug'

import { REMOTE_SCRIPT_CACHE_KEY, REMOTE_SCRIPT_ETAG_KEY } from '@/constants'
import { GME_fetch } from '@/helpers/http'
import { GME_debug, GME_fail, GME_ok } from '@/helpers/logger'
import { getRulesCacheStats } from '@/rules'
import { fetchScript } from '@/scripts'
import { EDITOR_DEV_EVENT_KEY, getEditorDevHost, getLocalDevHost, isEditorDevMode, isLocalDevMode, LOCAL_DEV_EVENT_KEY } from '@/services/dev-mode/constants'
import { isShellNetworkEffectivelyEnabled, isShellNetworkEnabled } from '@/services/shell-network-settings'

const REMOTE_SCRIPT_REFRESH_LOCK_KEY = 'vws_remote_script_refreshing'
const REMOTE_SCRIPT_REFRESH_LOCK_TTL_MS = 15_000

interface RemoteScriptCacheRecord {
  content: string
  etag: string
}

/**
 * Parse service scope from preset globals for scoped remote-script cache keys.
 * @returns Encoded `baseUrl|scriptKey` scope
 */
function getRemoteScriptCacheScope(): string {
  const scriptUrl = String(typeof __SCRIPT_URL__ !== 'undefined' ? __SCRIPT_URL__ : '')
  const keyMatch = scriptUrl.match(/\/static\/([^/]+)\//)
  const key = keyMatch?.[1] ?? '__default__'
  const base = String(typeof __BASE_URL__ !== 'undefined' ? __BASE_URL__ : '')
  return encodeURIComponent(`${base}|${key}`)
}

function getRemoteScriptCacheKeys(): { content: string; etag: string } {
  const scope = getRemoteScriptCacheScope()
  return {
    content: `${REMOTE_SCRIPT_CACHE_KEY}:${scope}`,
    etag: `${REMOTE_SCRIPT_ETAG_KEY}:${scope}`,
  }
}

function normalizeRemoteEtag(etag: string): string {
  if (!etag || typeof etag !== 'string') return ''
  return etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
}

function readRemoteScriptCache(): RemoteScriptCacheRecord | null {
  try {
    const keys = getRemoteScriptCacheKeys()
    const scoped = String(GM_getValue(keys.content, '') || '')
    if (scoped) {
      return { content: scoped, etag: normalizeRemoteEtag(String(GM_getValue(keys.etag, '') || '')) }
    }
    const legacy = String(GM_getValue(REMOTE_SCRIPT_CACHE_KEY, '') || '')
    if (!legacy) return null
    return { content: legacy, etag: normalizeRemoteEtag(String(GM_getValue(REMOTE_SCRIPT_ETAG_KEY, '') || '')) }
  } catch {
    return null
  }
}

function writeRemoteScriptCache(content: string, etag: string): void {
  try {
    const keys = getRemoteScriptCacheKeys()
    GM_setValue(keys.content, content)
    GM_setValue(keys.etag, etag)
    GM_setValue(REMOTE_SCRIPT_CACHE_KEY, content)
    GM_setValue(REMOTE_SCRIPT_ETAG_KEY, etag)
  } catch {
    /* ignore cache write failures */
  }
}

/**
 * Execute script content using the real global (globalThis) so the script
 * sees preset APIs (matchRule, GME_*, etc.) and Tampermonkey GM_* APIs.
 * GM_* may be in script scope only; we merge them onto global so with(global) resolves them.
 * @param content Script content to execute
 */
export function executeScript(content: string): void {
  const execute = new Function('global', `with(global){${content}}`)
  // When run by launcher, use __GLOBAL__ (launcher's g) so remote script runs in the same sandbox as preset (matchRule, GM_*, etc.)
  const g = typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : ({} as any)
  const grants = eval(`({ ${__GRANTS_STRING__} })`) as Record<string, unknown>
  const prev = (g as any).__IS_REMOTE_EXECUTE__
  try {
    Object.assign(g, grants, { __IS_REMOTE_EXECUTE__: true })
    execute(g)
  } finally {
    ;(g as any).__IS_REMOTE_EXECUTE__ = prev
  }
}

function logRemoteScriptCacheInventory(cached: RemoteScriptCacheRecord | null, url: string): void {
  const rules = getRulesCacheStats()
  const modules = cached?.content ? countCompiledRemoteModules(cached.content) : 0
  GME_debug(
    `[Remote script] cache:inventory ${formatCacheInventory({
      hit: Boolean(cached?.content),
      bytes: cached?.content?.length ?? 0,
      etag: shortCacheLabel(cached?.etag ?? ''),
      modules,
      rules: rules.ruleCount,
      scripts: rules.scriptCount,
      url: url.length > 80 ? `${url.slice(0, 80)}...` : url,
    })}`
  )
}

async function refreshRemoteScriptInBackground(url: string, previousCache: RemoteScriptCacheRecord | null): Promise<void> {
  if (!isShellNetworkEnabled()) return

  GME_debug(`[Remote script] refresh:start etag=${shortCacheLabel(previousCache?.etag ?? '')}`)

  const now = Date.now()
  const lockUntil = Number(GM_getValue(REMOTE_SCRIPT_REFRESH_LOCK_KEY, 0))
  if (Number.isFinite(lockUntil) && lockUntil > now) return

  GM_setValue(REMOTE_SCRIPT_REFRESH_LOCK_KEY, now + REMOTE_SCRIPT_REFRESH_LOCK_TTL_MS)
  try {
    const headers: Record<string, string> = {}
    if (previousCache?.etag) {
      headers['If-None-Match'] = previousCache.etag
    }
    const response = await GME_fetch(url, { method: 'GET', headers })
    if (response.status === 304) {
      GME_debug('[Remote script] refresh:not-modified')
      return
    }
    if (!response.ok) {
      GME_debug(`[Remote script] refresh:skip status=${response.status}`)
      return
    }

    const etag = normalizeRemoteEtag(String(response.headers.get('etag') || ''))
    const content = await response.text()
    if (!content) return

    const changed = !previousCache || previousCache.content !== content
    writeRemoteScriptCache(content, etag)
    GME_debug(`[Remote script] refresh:cached bytes=${content.length} changed=${changed ? 'yes' : 'no'}`)

    const pageVisible = typeof document !== 'undefined' && document.visibilityState === 'visible'
    if (changed && typeof window !== 'undefined' && pageVisible) {
      window.location.reload()
    }
  } catch (error) {
    GME_debug(`[Remote script] refresh:error ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    GM_setValue(REMOTE_SCRIPT_REFRESH_LOCK_KEY, 0)
  }
}

/**
 * Execute remote script from URL
 * @param url Script URL to fetch and execute
 */
export async function executeRemoteScript(url: string = __SCRIPT_URL__): Promise<void> {
  const cached = readRemoteScriptCache()
  logRemoteScriptCacheInventory(cached, url)

  if (cached?.content && isShellNetworkEffectivelyEnabled()) {
    GME_debug(`[Remote script] load:cache-first bytes=${cached.content.length} modules=${countCompiledRemoteModules(cached.content)} rules=${getRulesCacheStats().ruleCount}`)
    GME_ok('Remote script ready.')
    executeScript(cached.content)
    void refreshRemoteScriptInBackground(url, cached)
    return
  }

  let content: string | null = cached?.content ?? null
  if (!isShellNetworkEffectivelyEnabled()) {
    if (content) {
      GME_debug('[Remote script] Shell network off, using cached remote script')
    } else {
      GME_debug('[Remote script] Shell network off and no cache, attempting one-time bootstrap fetch')
      try {
        content = await fetchScript(url)
        if (content) {
          writeRemoteScriptCache(content, '')
          GME_debug('[Remote script] Bootstrap fetch succeeded, remote script cached')
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        GME_fail('[Remote script] Bootstrap fetch failed: ' + msg)
        return
      }
    }
  } else {
    GME_debug('[Remote script] load:remote-first no local cache — fetch from server before execute url=' + (url.length > 120 ? url.slice(0, 120) + '...' : url))
    try {
      content = await fetchScript(url)
      if (content) {
        writeRemoteScriptCache(content, '')
        GME_debug(`[Remote script] load:remote-first fetch:success bytes=${content.length}`)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      GME_fail('[Remote script] Fetch failed: ' + msg)
      return
    }
  }

  if (!content) {
    GME_debug('[Remote script] load:abort no content after fetch/cache')
    return
  }

  GME_debug(`[Remote script] execute:start bytes=${content.length} modules=${countCompiledRemoteModules(content)} scripts=${getRulesCacheStats().scriptCount}`)
  GME_ok('Remote script ready.')
  executeScript(content)
}

/**
 * Execute local dev mode script
 */
export async function executeLocalScript(): Promise<void> {
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
export async function executeEditorScript(): Promise<boolean> {
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
      GME_debug('[Editor Dev Mode] Early initialization detected, waiting for real files from editor...')
      return true // Return true to keep DEV MODE active, files will come later
    }
    return false
  }

  try {
    // Compiled content is required - if not available, wait for editor to send it
    if (!compiledContent) {
      if (isEarlyInit) {
        GME_debug('[Editor Dev Mode] Early initialization - no compiled content yet. DEV MODE active, waiting for files...')
        return true // Keep DEV MODE active
      }
      GME_debug('[Editor Dev Mode] No compiled content available yet. Waiting for editor to compile and send files...')
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
export function watchHMRUpdates({ onOpen, onClose, onError, onUpdate }: { onOpen?: () => void; onClose?: () => void; onError?: () => void; onUpdate?: () => void }): void {
  const ws = new WebSocket(__HMK_URL__)
  ws.addEventListener('open', () => {
    GME_ok('Connected to HMR WebSocket')

    onOpen && onOpen()
  })

  ws.addEventListener('close', async () => {
    GME_debug('HMR WebSocket closed')

    onClose && onClose()
    setTimeout(() => watchHMRUpdates({ onOpen, onClose, onError, onUpdate }), 3e3)
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
