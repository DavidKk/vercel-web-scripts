import { executeWithGlobal, executeWithGlobalResilient, isCspEvalError, isCspExtensionFallbackRequired } from '@shared/csp-script-executor'
import { buildEditorLibExecDecls, isLikelyEditorLibBundle } from '@shared/preset-launcher-decls'

import { isExtensionPageContext } from '@/helpers/env'
import { GME_fetch } from '@/helpers/http'
import { parseStaticKeyFromScriptUrl, readLauncherBaseUrl, readLauncherScriptKey, resolveLauncherScriptUrl, shortUrlLabel } from '@/helpers/launcher-script-url'
import { createGMELogger } from '@/helpers/logger'
import { ensureRuntimeCore, type RuntimeCoreApi } from '@/services/runtime-core'
import { shouldLogToConsole } from '@/services/shell-log-settings'
import { isShellNetworkEnabled } from '@/services/shell-network-settings'

/** Must match `PENDING_SEGMENT` in server `contentAddressedAssets`. */
const STATIC_PENDING_SEGMENT = 'pending'

export type EditorProfile = 'plain' | 'json' | 'javascript' | 'html' | 'css' | 'markdown'

export interface EditorLibCreateOptions {
  parent: HTMLElement
  profile?: EditorProfile
  readOnly?: boolean
  value?: string
  onChange?: (value: string) => void
  isolated?: boolean
}

export interface EditorHandle {
  getValue(): string
  setValue(value: string): void
  focus(): void
  destroy(): void
}

export interface EditorLibApi {
  version: 1
  ready: true
  create(options: EditorLibCreateOptions): EditorHandle
}

const EDITOR_LIB_LOG_PREFIX = '[ModuleLoad][editor-lib]'
const { GME_debug, GME_warn } = createGMELogger('ModuleLoad:editor-lib')
const EDITOR_LIB_CACHE_KEY_PREFIX = 'vws_editor_lib'
const EDITOR_LIB_REFRESH_LOCK_KEY = 'vws_editor_lib_refreshing'
const EDITOR_LIB_REFRESH_LOCK_TTL_MS = 15_000

let ensureEditorLibInflight: Promise<EditorLibApi | null> | null = null

function resolveEditorLibScriptKey(): string | null {
  const scriptUrl = resolveLauncherScriptUrl()
  return parseStaticKeyFromScriptUrl(scriptUrl) || readLauncherScriptKey() || null
}

function buildModuleManifestUrl(): string | null {
  try {
    const key = resolveEditorLibScriptKey()
    if (!key) return null
    const base = readLauncherBaseUrl()
    if (!base) return null
    return `${base}/static/${key}/module-manifest.json`
  } catch {
    return null
  }
}

function isEditorLibModuleUrl(url: string): boolean {
  return /\/editor-lib\.js(?:$|[?#])/i.test(url)
}

async function resolveEditorLibScriptUrl(): Promise<string | null> {
  const staticKey = resolveEditorLibScriptKey()
  const base = readLauncherBaseUrl()
  const keyForFallback = staticKey || '__missing_script_key__'
  const fallback = base.length > 0 ? `${base}/static/${keyForFallback}/${STATIC_PENDING_SEGMENT}/editor-lib.js` : null
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
    if (mod && mod.id === 'editor-lib' && typeof mod.url === 'string' && mod.url.length > 0 && isEditorLibModuleUrl(mod.url)) {
      GME_debug(`${EDITOR_LIB_LOG_PREFIX} resolve:url ${shortUrlLabel(mod.url, 120)}`)
      return mod.url
    }
  }
  GME_debug(`${EDITOR_LIB_LOG_PREFIX} resolve:fallback manifest missing editor-lib url`)
  return fallback
}

function reportEditorLibLoadFailure(context: string, technicalDetail: string): void {
  const line = `${EDITOR_LIB_LOG_PREFIX} ${context} ${technicalDetail}`
  if (shouldLogToConsole()) {
    // eslint-disable-next-line no-console -- explicit visibility when logger not ready
    console.warn('[VWS][editor-lib]', context, technicalDetail)
  }
  GME_warn(line)
}

interface EditorLibCacheRecord {
  content: string
  url: string
  etag: string
}

function getEditorLibScopeKey(): string {
  return resolveEditorLibScriptKey() || '__default__'
}

function getEditorLibCacheKeys(): { content: string; etag: string; url: string } {
  const scope = getEditorLibScopeKey()
  return {
    content: `${EDITOR_LIB_CACHE_KEY_PREFIX}:${scope}:content`,
    etag: `${EDITOR_LIB_CACHE_KEY_PREFIX}:${scope}:etag`,
    url: `${EDITOR_LIB_CACHE_KEY_PREFIX}:${scope}:url`,
  }
}

function readEditorLibCache(): EditorLibCacheRecord | null {
  try {
    const keys = getEditorLibCacheKeys()
    const content = String(GM_getValue(keys.content, '') || '')
    if (!content) return null
    const etag = String(GM_getValue(keys.etag, '') || '')
    const url = String(GM_getValue(keys.url, '') || '')
    return { content, etag, url }
  } catch {
    return null
  }
}

function clearEditorLibCache(): void {
  try {
    const keys = getEditorLibCacheKeys()
    GM_deleteValue(keys.content)
    GM_deleteValue(keys.url)
    GM_deleteValue(keys.etag)
  } catch {
    /* ignore */
  }
}

function writeEditorLibCache(content: string, url: string, etag: string): void {
  try {
    const keys = getEditorLibCacheKeys()
    GM_setValue(keys.content, content)
    GM_setValue(keys.url, url)
    GM_setValue(keys.etag, etag)
  } catch {
    /* ignore */
  }
}

function readRegisteredEditorLib(core: { get?: (id: string) => unknown } | undefined): EditorLibApi | null {
  const loaded = core?.get ? (core.get('editor-lib') as EditorLibApi | undefined) : undefined
  return loaded ?? null
}

function mirrorEditorLibRuntimeToPageWorld(g: Record<string, unknown>, core: RuntimeCoreApi): void {
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

async function executeEditorLibContent(content: string, sourceUrl?: string): Promise<EditorLibApi | null> {
  if (!isLikelyEditorLibBundle(content)) {
    reportEditorLibLoadFailure('execute:invalid-bundle', `bytes=${content?.length ?? 0} url=${shortUrlLabel(sourceUrl ?? '', 120) || '(unknown)'}`)
    return null
  }
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as Record<string, unknown>
  const core = ensureRuntimeCore()
  mirrorEditorLibRuntimeToPageWorld(g, core)
  const body = `${buildEditorLibExecDecls(sourceUrl)}\n${content}`
  GME_debug(`${EDITOR_LIB_LOG_PREFIX} execute:start bytes=${content.length} url=${shortUrlLabel(sourceUrl ?? '', 120) || '(cache)'}`)
  try {
    const mode = isExtensionPageContext() ? await executeWithGlobalResilient(g, body, { preferUserScript: true }) : executeWithGlobal(g, body)
    GME_debug(`${EDITOR_LIB_LOG_PREFIX} execute:mode=${mode}`)
    const loaded = readRegisteredEditorLib(core)
    if (!loaded) {
      reportEditorLibLoadFailure('execute:finished-without-register', 'Script ran but did not register editor-lib on __VWS_CORE__.')
    }
    return loaded
  } catch (error) {
    if (isCspExtensionFallbackRequired(error)) {
      try {
        mirrorEditorLibRuntimeToPageWorld(g, core)
        const mode = await executeWithGlobalResilient(g, body)
        GME_debug(`${EDITOR_LIB_LOG_PREFIX} execute:mode=${mode}`)
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        reportEditorLibLoadFailure('execute:csp-fallback-failed', message)
        return null
      }
      return readRegisteredEditorLib(core)
    }
    const message = error instanceof Error ? error.message : String(error)
    const context = isCspEvalError(error) ? 'execute:csp-fallback-failed' : 'execute:cache-exception'
    reportEditorLibLoadFailure(context, message)
    return null
  }
}

async function refreshEditorLibInBackground(previousCache: EditorLibCacheRecord | null): Promise<void> {
  if (!isShellNetworkEnabled()) return
  const now = Date.now()
  const lockUntil = Number(GM_getValue(EDITOR_LIB_REFRESH_LOCK_KEY, 0))
  if (Number.isFinite(lockUntil) && lockUntil > now) return

  GM_setValue(EDITOR_LIB_REFRESH_LOCK_KEY, now + EDITOR_LIB_REFRESH_LOCK_TTL_MS)
  try {
    const url = await resolveEditorLibScriptUrl()
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
    writeEditorLibCache(content, url, etag)
    GME_debug(`${EDITOR_LIB_LOG_PREFIX} refresh:cached bytes=${content.length}`)
  } catch (error) {
    GME_debug(`${EDITOR_LIB_LOG_PREFIX} refresh:error ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    GM_setValue(EDITOR_LIB_REFRESH_LOCK_KEY, 0)
  }
}

/**
 * Lazily load editor-lib; concurrent calls are coalesced.
 * Failure does not throw — returns null so preset-core / script-bundle continue.
 * @returns Editor-lib API if available
 */
export async function ensureEditorLib(): Promise<EditorLibApi | null> {
  if (ensureEditorLibInflight) {
    return ensureEditorLibInflight
  }
  ensureEditorLibInflight = ensureEditorLibOnce().finally(() => {
    ensureEditorLibInflight = null
  })
  return ensureEditorLibInflight
}

async function ensureEditorLibOnce(): Promise<EditorLibApi | null> {
  GME_debug(`${EDITOR_LIB_LOG_PREFIX} load:start`)
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as Record<string, unknown>
  const core = g.__VWS_CORE__ as { get?: (id: string) => unknown } | undefined
  if (core?.get) {
    const existing = core.get('editor-lib') as EditorLibApi | undefined
    if (existing) {
      GME_debug(`${EDITOR_LIB_LOG_PREFIX} load:registry-hit`)
      return existing
    }
  }

  const cache = readEditorLibCache()
  if (cache?.content) {
    if (!isLikelyEditorLibBundle(cache.content)) {
      clearEditorLibCache()
    } else {
      const loadedFromCache = await executeEditorLibContent(cache.content, cache.url)
      if (loadedFromCache) {
        void refreshEditorLibInBackground(cache)
        return loadedFromCache
      }
      void refreshEditorLibInBackground(cache)
      return null
    }
  }

  if (!isShellNetworkEnabled()) {
    GME_warn(`${EDITOR_LIB_LOG_PREFIX} load:skip:network-off`)
    return null
  }

  try {
    const url = await resolveEditorLibScriptUrl()
    if (!url) {
      reportEditorLibLoadFailure('fetch:no-url', `base=${readLauncherBaseUrl() || '(none)'} key=${resolveEditorLibScriptKey() || '(none)'}`)
      return null
    }
    const response = await GME_fetch(url, { method: 'GET' })
    if (!response.ok) {
      reportEditorLibLoadFailure(`fetch:failed:status:${response.status}`, `url=${url.slice(0, 160)}`)
      return null
    }
    const content = await response.text()
    if (!isLikelyEditorLibBundle(content)) {
      reportEditorLibLoadFailure('fetch:invalid-bundle', `bytes=${content.length} url=${shortUrlLabel(url, 120)}`)
      return null
    }
    const etag = String(response.headers.get('etag') || '').trim()
    writeEditorLibCache(content, url, etag)
    return executeEditorLibContent(content, url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportEditorLibLoadFailure('load:exception', message)
    return null
  }
}
