import { executeWithGlobal, executeWithGlobalResilient, isCspEvalError, isCspExtensionFallbackRequired } from '@shared/csp-script-executor'
import { buildExplorerLibExecDecls, isLikelyExplorerLibBundle } from '@shared/preset-launcher-decls'

import { isExtensionPageContext } from '@/helpers/env'
import { GME_fetch } from '@/helpers/http'
import { parseStaticKeyFromScriptUrl, readLauncherBaseUrl, readLauncherScriptKey, resolveLauncherScriptUrl, shortUrlLabel } from '@/helpers/launcher-script-url'
import { createGMELogger } from '@/helpers/logger'
import { ensureRuntimeCore, type RuntimeCoreApi } from '@/services/runtime-core'
import { shouldLogToConsole } from '@/services/shell-log-settings'
import { isShellNetworkEnabled } from '@/services/shell-network-settings'

/** Must match `PENDING_SEGMENT` in server `contentAddressedAssets`. */
const STATIC_PENDING_SEGMENT = 'pending'

export interface ExplorerChromeOptions {
  title?: string
  searchPlaceholder?: string
  onSearchChange?: (query: string) => void
}

export interface ExplorerChromeHandle {
  root: HTMLElement
  treeHost: HTMLElement
  getSearchQuery(): string
  setSearchQuery(query: string): void
  setSearchOpen(open: boolean): void
  toggleSearch(): void
  focusSearch(): void
  destroy(): void
}

export interface ExplorerLibApi {
  version: 1
  ready: true
  createChrome(parent: HTMLElement, options?: ExplorerChromeOptions): ExplorerChromeHandle
  createTabBar(parent: HTMLElement, options?: TabBarOptions): TabBarHandle
  listLoadingHtml(message?: string): string
  listNoDataHtml(options?: ListNoDataOptions): string
}

export interface TabBarOptions {
  onTabSwitch?: (path: string) => void | Promise<void>
  onTabClose?: (path: string) => void
  isDirty?: (path: string) => boolean
  getFileName?: (path: string) => string
  renderFileIcon?: (fileName: string) => string
}

export interface TabBarHandle {
  openTab(path: string, options?: { preview?: boolean }): void
  closeTab(path: string): void
  switchTab(path: string): void
  closeAllTabs(): void
  closeOtherTabs(path: string): void
  closeTabsToRight(path: string): void
  getActiveTab(): string | null
  getOpenTabs(): string[]
  isTabOpen(path: string): boolean
  refresh(): void
  destroy(): void
}

export interface ListNoDataOptions {
  search?: boolean
  title?: string
  hint?: string
}

const EXPLORER_LIB_LOG_PREFIX = '[ModuleLoad][explorer-lib]'
const { GME_debug, GME_warn } = createGMELogger('ModuleLoad:explorer-lib')
const EXPLORER_LIB_CACHE_KEY_PREFIX = 'vws_explorer_lib'
const EXPLORER_LIB_REFRESH_LOCK_KEY = 'vws_explorer_lib_refreshing'
const EXPLORER_LIB_REFRESH_LOCK_TTL_MS = 15_000

let ensureExplorerLibInflight: Promise<ExplorerLibApi | null> | null = null

function resolveExplorerLibScriptKey(): string | null {
  const scriptUrl = resolveLauncherScriptUrl()
  return parseStaticKeyFromScriptUrl(scriptUrl) || readLauncherScriptKey() || null
}

function buildModuleManifestUrl(): string | null {
  try {
    const key = resolveExplorerLibScriptKey()
    if (!key) return null
    const base = readLauncherBaseUrl()
    if (!base) return null
    return `${base}/static/${key}/module-manifest.json`
  } catch {
    return null
  }
}

function isExplorerLibModuleUrl(url: string): boolean {
  return /\/explorer-lib\.js(?:$|[?#])/i.test(url)
}

async function resolveExplorerLibScriptUrl(): Promise<string | null> {
  const staticKey = resolveExplorerLibScriptKey()
  const base = readLauncherBaseUrl()
  const keyForFallback = staticKey || '__missing_script_key__'
  const fallback = base.length > 0 ? `${base}/static/${keyForFallback}/${STATIC_PENDING_SEGMENT}/explorer-lib.js` : null
  const manifestUrl = buildModuleManifestUrl()
  if (!manifestUrl) {
    return fallback
  }
  const response = await GME_fetch(manifestUrl, { method: 'GET' })
  if (!response.ok) {
    return fallback
  }
  const data = (await response.json()) as { modules?: { id?: string; url?: string }[] }
  const modules = data.modules
  if (!Array.isArray(modules)) {
    return fallback
  }
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i]
    if (mod && mod.id === 'explorer-lib' && typeof mod.url === 'string' && mod.url.length > 0 && isExplorerLibModuleUrl(mod.url)) {
      GME_debug(`${EXPLORER_LIB_LOG_PREFIX} resolve:url ${shortUrlLabel(mod.url, 120)}`)
      return mod.url
    }
  }
  GME_debug(`${EXPLORER_LIB_LOG_PREFIX} resolve:fallback manifest missing explorer-lib url`)
  return fallback
}

function reportExplorerLibLoadFailure(context: string, technicalDetail: string): void {
  const line = `${EXPLORER_LIB_LOG_PREFIX} ${context} ${technicalDetail}`
  if (shouldLogToConsole()) {
    // eslint-disable-next-line no-console -- explicit visibility when logger not ready
    console.warn('[VWS][explorer-lib]', context, technicalDetail)
  }
  GME_warn(line)
}

interface ExplorerLibCacheRecord {
  content: string
  url: string
  etag: string
}

function getExplorerLibScopeKey(): string {
  return resolveExplorerLibScriptKey() || '__default__'
}

function getExplorerLibCacheKeys(): { content: string; etag: string; url: string } {
  const scope = getExplorerLibScopeKey()
  return {
    content: `${EXPLORER_LIB_CACHE_KEY_PREFIX}:${scope}:content`,
    etag: `${EXPLORER_LIB_CACHE_KEY_PREFIX}:${scope}:etag`,
    url: `${EXPLORER_LIB_CACHE_KEY_PREFIX}:${scope}:url`,
  }
}

function readExplorerLibCache(): ExplorerLibCacheRecord | null {
  try {
    const keys = getExplorerLibCacheKeys()
    const content = String(GM_getValue(keys.content, '') || '')
    if (!content) return null
    const etag = String(GM_getValue(keys.etag, '') || '')
    const url = String(GM_getValue(keys.url, '') || '')
    return { content, etag, url }
  } catch {
    return null
  }
}

function clearExplorerLibCache(): void {
  try {
    const keys = getExplorerLibCacheKeys()
    GM_deleteValue(keys.content)
    GM_deleteValue(keys.url)
    GM_deleteValue(keys.etag)
  } catch {
    /* ignore */
  }
}

function writeExplorerLibCache(content: string, url: string, etag: string): void {
  try {
    const keys = getExplorerLibCacheKeys()
    GM_setValue(keys.content, content)
    GM_setValue(keys.url, url)
    GM_setValue(keys.etag, etag)
  } catch {
    /* ignore */
  }
}

function readRegisteredExplorerLib(core: { get?: (id: string) => unknown } | undefined): ExplorerLibApi | null {
  const loaded = core?.get ? (core.get('explorer-lib') as ExplorerLibApi | undefined) : undefined
  return loaded ?? null
}

function mirrorExplorerLibRuntimeToPageWorld(g: Record<string, unknown>, core: RuntimeCoreApi): void {
  g.__GLOBAL__ = g
  g.__VWS_CORE__ = core
  try {
    if (typeof window !== 'undefined') {
      const w = window as unknown as Record<string, unknown>
      w.__GLOBAL__ = g
      w.__VWS_CORE__ = core
    }
  } catch {
    /* ignore */
  }
}

async function executeExplorerLibContent(content: string, sourceUrl?: string): Promise<ExplorerLibApi | null> {
  if (!isLikelyExplorerLibBundle(content)) {
    reportExplorerLibLoadFailure('execute:invalid-bundle', `bytes=${content?.length ?? 0} url=${shortUrlLabel(sourceUrl ?? '', 120) || '(unknown)'}`)
    return null
  }
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as Record<string, unknown>
  const core = ensureRuntimeCore()
  mirrorExplorerLibRuntimeToPageWorld(g, core)
  const body = `${buildExplorerLibExecDecls()}\n${content}`
  GME_debug(`${EXPLORER_LIB_LOG_PREFIX} execute:start bytes=${content.length} url=${shortUrlLabel(sourceUrl ?? '', 120) || '(cache)'}`)
  try {
    const mode = isExtensionPageContext() ? await executeWithGlobalResilient(g, body, { preferUserScript: true }) : executeWithGlobal(g, body)
    GME_debug(`${EXPLORER_LIB_LOG_PREFIX} execute:mode=${mode}`)
    const loaded = readRegisteredExplorerLib(core)
    if (!loaded) {
      reportExplorerLibLoadFailure('execute:finished-without-register', 'Script ran but did not register explorer-lib on __VWS_CORE__.')
    }
    return loaded
  } catch (error) {
    if (isCspExtensionFallbackRequired(error)) {
      try {
        mirrorExplorerLibRuntimeToPageWorld(g, core)
        const mode = await executeWithGlobalResilient(g, body)
        GME_debug(`${EXPLORER_LIB_LOG_PREFIX} execute:mode=${mode}`)
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        reportExplorerLibLoadFailure('execute:csp-fallback-failed', message)
        return null
      }
      return readRegisteredExplorerLib(core)
    }
    const message = error instanceof Error ? error.message : String(error)
    const context = isCspEvalError(error) ? 'execute:csp-fallback-failed' : 'execute:cache-exception'
    reportExplorerLibLoadFailure(context, message)
    return null
  }
}

async function refreshExplorerLibInBackground(previousCache: ExplorerLibCacheRecord | null): Promise<void> {
  if (!isShellNetworkEnabled()) return
  const now = Date.now()
  const lockUntil = Number(GM_getValue(EXPLORER_LIB_REFRESH_LOCK_KEY, 0))
  if (Number.isFinite(lockUntil) && lockUntil > now) return

  GM_setValue(EXPLORER_LIB_REFRESH_LOCK_KEY, now + EXPLORER_LIB_REFRESH_LOCK_TTL_MS)
  try {
    const url = await resolveExplorerLibScriptUrl()
    if (!url) return
    const headers: Record<string, string> = {}
    if (previousCache?.etag) {
      headers['If-None-Match'] = previousCache.etag
    }
    const response = await GME_fetch(url, { method: 'GET', headers })
    if (response.status === 304 || !response.ok) return
    const etag = String(response.headers.get('etag') || '').trim()
    const content = await response.text()
    if (!content) return
    writeExplorerLibCache(content, url, etag)
    GME_debug(`${EXPLORER_LIB_LOG_PREFIX} refresh:cached bytes=${content.length}`)
  } catch (error) {
    GME_debug(`${EXPLORER_LIB_LOG_PREFIX} refresh:error ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    GM_setValue(EXPLORER_LIB_REFRESH_LOCK_KEY, 0)
  }
}

/**
 * Lazily load explorer-lib; concurrent calls are coalesced.
 * Failure does not throw — returns null so preset-core / script-bundle continue.
 * @returns Explorer-lib API if available
 */
export async function ensureExplorerLib(): Promise<ExplorerLibApi | null> {
  if (ensureExplorerLibInflight) {
    return ensureExplorerLibInflight
  }
  ensureExplorerLibInflight = ensureExplorerLibOnce().finally(() => {
    ensureExplorerLibInflight = null
  })
  return ensureExplorerLibInflight
}

async function ensureExplorerLibOnce(): Promise<ExplorerLibApi | null> {
  GME_debug(`${EXPLORER_LIB_LOG_PREFIX} load:start`)
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as Record<string, unknown>
  const core = g.__VWS_CORE__ as { get?: (id: string) => unknown } | undefined
  if (core?.get) {
    const existing = core.get('explorer-lib') as ExplorerLibApi | undefined
    if (existing) {
      GME_debug(`${EXPLORER_LIB_LOG_PREFIX} load:registry-hit`)
      return existing
    }
  }

  const cache = readExplorerLibCache()
  if (cache?.content) {
    if (!isLikelyExplorerLibBundle(cache.content)) {
      clearExplorerLibCache()
    } else {
      const loadedFromCache = await executeExplorerLibContent(cache.content, cache.url)
      if (loadedFromCache) {
        void refreshExplorerLibInBackground(cache)
        return loadedFromCache
      }
      void refreshExplorerLibInBackground(cache)
      return null
    }
  }

  if (!isShellNetworkEnabled()) {
    GME_warn(`${EXPLORER_LIB_LOG_PREFIX} load:skip:network-off`)
    return null
  }

  try {
    const url = await resolveExplorerLibScriptUrl()
    if (!url) {
      reportExplorerLibLoadFailure('fetch:no-url', `base=${readLauncherBaseUrl() || '(none)'} key=${resolveExplorerLibScriptKey() || '(none)'}`)
      return null
    }
    const response = await GME_fetch(url, { method: 'GET' })
    if (!response.ok) {
      reportExplorerLibLoadFailure(`fetch:failed:status:${response.status}`, `url=${url.slice(0, 160)}`)
      return null
    }
    const content = await response.text()
    if (!isLikelyExplorerLibBundle(content)) {
      reportExplorerLibLoadFailure('fetch:invalid-bundle', `bytes=${content.length} url=${shortUrlLabel(url, 120)}`)
      return null
    }
    const etag = String(response.headers.get('etag') || '').trim()
    writeExplorerLibCache(content, url, etag)
    return executeExplorerLibContent(content, url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportExplorerLibLoadFailure('load:exception', message)
    return null
  }
}
