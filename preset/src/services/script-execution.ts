/**
 * Script execution functions
 */

import { countCompiledRemoteModules, formatCacheInventory, shortCacheLabel } from '@shared/cache-debug'
import { buildGrantsFromGlobal, type CspScriptExecuteMode, executeWithGlobal, executeWithGlobalResilient, isCspExtensionFallbackRequired } from '@shared/csp-script-executor'
import { REMOTE_SCRIPT_CACHE_KEY, REMOTE_SCRIPT_ETAG_KEY, SCRIPT_MODULE_CACHE_KEY } from '@shared/launcher-constants'
import { filterDisabledRemoteModules, listDisabledRemoteModules, readExtensionEnabledScripts } from '@shared/remote-script-module-filter'
import { buildRemoteModuleCacheFromBundle, mergeRemoteBundleWithOtaPolicy } from '@shared/remote-script-ota-merge'
import type { ScriptOtaPolicy } from '@shared/script-ota-policy'
import { buildWithGlobalExecutionSandbox } from '@shared/with-global-sandbox'

import { isExtensionPageContext } from '@/helpers/env'
import { GME_fetch } from '@/helpers/http'
import { getLauncherBootstrapCacheScope, parseStaticKeyFromScriptUrl, readLauncherScriptKey, resolveLauncherScriptUrl, shortUrlLabel } from '@/helpers/launcher-script-url'
import { GME_debug, GME_fail, GME_ok } from '@/helpers/logger'
import { getRulesCacheStats } from '@/rules'
import { fetchScript } from '@/scripts'
import { EDITOR_DEV_EVENT_KEY, getEditorDevHost, getLocalDevHost, isEditorDevMode, isLocalDevMode, LOCAL_DEV_EVENT_KEY } from '@/services/dev-mode/constants'
import { handlePassiveOtaUpdate } from '@/services/ota-passive-update'
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
  const scope = getLauncherBootstrapCacheScope()
  if (scope) {
    return scope
  }
  const scriptUrl = resolveLauncherScriptUrl()
  const key = parseStaticKeyFromScriptUrl(scriptUrl) || readLauncherScriptKey() || '__default__'
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
    writeRemoteModuleCache(content)
  } catch {
    /* ignore cache write failures */
  }
}

function moduleCacheKeyPrefix(): string {
  return `${SCRIPT_MODULE_CACHE_KEY}:${getRemoteScriptCacheScope()}:`
}

function readRemoteModuleCache(): Record<string, string> {
  const prefix = moduleCacheKeyPrefix()
  const cache: Record<string, string> = {}
  try {
    for (const key of GM_listValues()) {
      if (key.startsWith(prefix)) {
        const file = key.slice(prefix.length)
        if (!file) {
          continue
        }
        const value = GM_getValue(key, '')
        if (typeof value === 'string' && value.length > 0) {
          cache[file] = value
        }
      }
    }
  } catch {
    /* ignore cache read failures */
  }
  return cache
}

function writeRemoteModuleCache(content: string): void {
  const prefix = moduleCacheKeyPrefix()
  const next = buildRemoteModuleCacheFromBundle(content)
  const staleKeys = new Set<string>()
  try {
    for (const key of GM_listValues()) {
      if (key.startsWith(prefix)) {
        staleKeys.add(key)
      }
    }
    for (const [file, body] of Object.entries(next)) {
      const key = `${prefix}${file}`
      GM_setValue(key, body)
      staleKeys.delete(key)
    }
    for (const stale of staleKeys) {
      GM_deleteValue(stale)
    }
  } catch {
    /* ignore per-file cache write failures */
  }
}

function readRemoteOtaContext(): {
  scriptPolicies: Record<string, ScriptOtaPolicy & { version?: string }>
  manualUpdate: boolean
} {
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : {}) as Record<string, unknown>
  const policies = g.__VWS_SCRIPT_POLICIES__
  return {
    scriptPolicies: policies && typeof policies === 'object' && !Array.isArray(policies) ? (policies as Record<string, ScriptOtaPolicy & { version?: string }>) : {},
    manualUpdate: g.__VWS_OTA_MANUAL_UPDATE__ === true,
  }
}

function prepareRemoteBundleContent(rawContent: string): string {
  const ota = readRemoteOtaContext()
  const merged = mergeRemoteBundleWithOtaPolicy({
    content: rawContent,
    scriptPolicies: ota.scriptPolicies,
    moduleCache: readRemoteModuleCache(),
    manualUpdate: ota.manualUpdate,
  })
  if (merged.pinnedFromCache.length > 0) {
    GME_debug(`[Remote script] ota:pinned ${merged.pinnedFromCache.join(', ')}`)
  }
  return merged.content
}

/**
 * Execute script content using the real global (globalThis) so the script
 * sees preset APIs (matchRule, GME_*, etc.) and Tampermonkey GM_* APIs.
 * GM_* may be in script scope only; we merge them onto global and pass a narrowed
 * sandbox into `with(global)` so native DOM APIs are not shadowed (Illegal invocation).
 * @param content Script content to execute
 */
export async function executeScript(content: string): Promise<void> {
  // When run by launcher, use __GLOBAL__ (launcher's g) so remote script runs in the same sandbox as preset (matchRule, GM_*, etc.)
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {}) as Record<
    string,
    unknown
  >
  const enabledScripts = readExtensionEnabledScripts(g)
  const skippedModules = listDisabledRemoteModules(content, enabledScripts)
  const executableContent = filterDisabledRemoteModules(content, enabledScripts)
  if (skippedModules.length > 0) {
    GME_debug(`[Remote script] skip:disabled ${skippedModules.join(', ')}`)
  }
  const grants = buildGrantsFromGlobal(g, String(typeof __GRANTS_STRING__ !== 'undefined' ? __GRANTS_STRING__ : ''))
  const prev = g.__IS_REMOTE_EXECUTE__
  const prevCreateGMELogger = g.createGMELogger
  const scriptCreateGMELogger = g.createScriptGMELogger
  let executeMode: CspScriptExecuteMode = 'function'
  try {
    Object.assign(g, grants, { __IS_REMOTE_EXECUTE__: true })
    if (typeof scriptCreateGMELogger === 'function') {
      g.createGMELogger = scriptCreateGMELogger
    }
    const withGlobal = buildWithGlobalExecutionSandbox(g, { __IS_REMOTE_EXECUTE__: true })
    try {
      executeMode = isExtensionPageContext()
        ? await executeWithGlobalResilient(withGlobal, executableContent, { preferUserScript: true })
        : executeWithGlobal(withGlobal, executableContent)
    } catch (error) {
      if (!isCspExtensionFallbackRequired(error)) {
        throw error
      }
      executeMode = await executeWithGlobalResilient(withGlobal, executableContent)
    }
    GME_debug(`[Remote script] execute:finished mode=${executeMode} modules=${countCompiledRemoteModules(executableContent)} bytes=${executableContent.length}`)
  } finally {
    g.__IS_REMOTE_EXECUTE__ = prev
    if (prevCreateGMELogger === undefined) {
      delete g.createGMELogger
    } else {
      g.createGMELogger = prevCreateGMELogger
    }
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
      url: shortUrlLabel(url),
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
    const content = prepareRemoteBundleContent(await response.text())
    if (!content) return

    const changed = !previousCache || previousCache.content !== content
    writeRemoteScriptCache(content, etag)
    GME_debug(`[Remote script] refresh:cached bytes=${content.length} changed=${changed ? 'yes' : 'no'}`)

    if (changed) {
      handlePassiveOtaUpdate('remote-script', Boolean(previousCache?.content))
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
export async function executeRemoteScript(url?: string): Promise<void> {
  const scriptUrl = resolveLauncherScriptUrl(url)
  if (!scriptUrl) {
    GME_fail('[Remote script] Missing __SCRIPT_URL__ — cannot load remote bundle')
    return
  }
  const cached = readRemoteScriptCache()
  logRemoteScriptCacheInventory(cached, scriptUrl)

  if (cached?.content && isShellNetworkEffectivelyEnabled()) {
    const executable = prepareRemoteBundleContent(cached.content)
    GME_debug(`[Remote script] load:cache-first bytes=${executable.length} modules=${countCompiledRemoteModules(executable)} rules=${getRulesCacheStats().ruleCount}`)
    GME_debug(`[Remote script] execute:start bytes=${executable.length} modules=${countCompiledRemoteModules(executable)} scripts=${getRulesCacheStats().scriptCount}`)
    GME_ok('Remote script ready.')
    await executeScript(executable)
    void refreshRemoteScriptInBackground(scriptUrl, cached)
    return
  }

  let content: string | null = cached?.content ?? null
  if (!isShellNetworkEffectivelyEnabled()) {
    if (content) {
      GME_debug('[Remote script] Shell network off, using cached remote script')
    } else {
      GME_debug('[Remote script] Shell network off and no cache, attempting one-time bootstrap fetch')
      try {
        const fetched = await fetchScript(scriptUrl)
        if (fetched) {
          content = prepareRemoteBundleContent(fetched)
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
    GME_debug('[Remote script] load:remote-first no local cache — fetch from server before execute url=' + shortUrlLabel(scriptUrl, 120))
    try {
      const fetched = await fetchScript(scriptUrl)
      if (fetched) {
        content = prepareRemoteBundleContent(fetched)
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

  const executable = prepareRemoteBundleContent(content)
  GME_debug(`[Remote script] execute:start bytes=${executable.length} modules=${countCompiledRemoteModules(executable)} scripts=${getRulesCacheStats().scriptCount}`)
  GME_ok('Remote script ready.')
  await executeScript(executable)
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
  await executeScript(compiledContent)
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
    await executeScript(compiledContent)
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
