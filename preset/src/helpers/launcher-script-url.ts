/// <reference path="../typings.d.ts" />

import { SCRIPT_BUNDLE_URL_KEY } from '../constants'

/**
 * Parse Tampermonkey static route key from remote or launcher URL under `/static/[key]/...`.
 * @param scriptUrl Full script URL
 * @returns Key segment or null
 */
export function parseStaticKeyFromScriptUrl(scriptUrl: string): string | null {
  const remote = scriptUrl.match(/\/static\/([^/]+)\/(?:[a-f0-9]{40}\/)?tampermonkey-remote\.js(?:$|[?#])/i)
  if (remote?.[1]) {
    return remote[1]
  }
  const launcher = scriptUrl.match(/\/static\/([^/]+)\/tampermonkey\.user\.js(?:$|[?#])/i)
  return launcher?.[1] ?? null
}

function readRootGlobals(): Record<string, unknown>[] {
  const roots: Record<string, unknown>[] = []
  try {
    if (typeof __GLOBAL__ !== 'undefined' && __GLOBAL__) {
      roots.push(__GLOBAL__ as unknown as Record<string, unknown>)
    }
  } catch {
    // __GLOBAL__ may be undeclared in some eval contexts
  }
  try {
    if (typeof globalThis !== 'undefined') {
      roots.push(globalThis as unknown as Record<string, unknown>)
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== 'undefined') {
      roots.push(window as unknown as Record<string, unknown>)
    }
  } catch {
    // ignore
  }
  return roots
}

/**
 * Read `__SCRIPT_URL__` from launcher sandbox objects (`__GLOBAL__` / globalThis / window).
 * @returns Trimmed URL or empty string
 */
export function readHostScriptUrl(): string {
  for (const host of readRootGlobals()) {
    const value = host.__SCRIPT_URL__
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

/**
 * Read MagickMonkey server base URL from preset decls or launcher globals.
 * @returns Origin without trailing slash
 */
export function readLauncherBaseUrl(): string {
  try {
    if (typeof __BASE_URL__ !== 'undefined' && __BASE_URL__) {
      return String(__BASE_URL__).replace(/\/+$/, '')
    }
  } catch {
    // undeclared in some eval contexts
  }
  for (const host of readRootGlobals()) {
    const value = host.__BASE_URL__
    if (typeof value === 'string' && value.trim()) {
      return value.trim().replace(/\/+$/, '')
    }
  }
  return ''
}

/**
 * Read script key injected by extension launcher (`__VWS_SCRIPT_KEY__`).
 * @returns Script key or empty string
 */
export function readLauncherScriptKey(): string {
  try {
    if (typeof __VWS_SCRIPT_KEY__ !== 'undefined' && __VWS_SCRIPT_KEY__) {
      return String(__VWS_SCRIPT_KEY__).trim()
    }
  } catch {
    // undeclared in some bundles
  }
  for (const host of readRootGlobals()) {
    const value = host.__VWS_SCRIPT_KEY__
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

/**
 * Build launcher bootstrap cache scope (`encodeURIComponent(baseUrl|scriptKey)`).
 * @returns Encoded scope or null when base/key cannot be resolved
 */
export function getLauncherBootstrapCacheScope(): string | null {
  const base = readLauncherBaseUrl()
  if (!base) {
    return null
  }
  // Do not call resolveLauncherScriptUrl() here — readScriptUrlFromGmStorage() depends on this scope.
  const key = parseStaticKeyFromScriptUrl(readHostScriptUrl()) || readLauncherScriptKey()
  if (!key) {
    return null
  }
  return encodeURIComponent(`${base}|${key}`)
}

/**
 * Read cached script-bundle URL persisted by launcher manifest refresh.
 * @returns Trimmed URL or empty string
 */
export function readScriptUrlFromGmStorage(): string {
  try {
    const scope = getLauncherBootstrapCacheScope()
    if (scope) {
      const scoped = String(GM_getValue(`${SCRIPT_BUNDLE_URL_KEY}:${scope}`, '') || '').trim()
      if (scoped) {
        return scoped
      }
    }
    const legacy = String(GM_getValue(SCRIPT_BUNDLE_URL_KEY, '') || '').trim()
    if (legacy) {
      return legacy
    }
  } catch {
    // GM_* may be unavailable in some contexts
  }
  return ''
}

/**
 * Build legacy unversioned remote script URL from base URL + script key.
 * @returns Absolute URL or empty string
 */
export function buildDefaultRemoteScriptUrl(): string {
  const base = readLauncherBaseUrl()
  const key = parseStaticKeyFromScriptUrl(readHostScriptUrl()) || readLauncherScriptKey()
  if (!base || !key) {
    return ''
  }
  return `${base}/static/${encodeURIComponent(key)}/tampermonkey-remote.js`
}

/**
 * Resolve remote bundle URL from arg, preset decls, launcher globals, GM cache, or defaults.
 * @param url Optional explicit URL
 * @returns Trimmed script-bundle URL or empty string
 */
export function resolveLauncherScriptUrl(url?: unknown): string {
  if (typeof url === 'string' && url.trim()) {
    return url.trim()
  }
  try {
    if (typeof __SCRIPT_URL__ !== 'undefined' && __SCRIPT_URL__) {
      const fromDecl = String(__SCRIPT_URL__).trim()
      if (fromDecl) {
        return fromDecl
      }
    }
  } catch {
    // __SCRIPT_URL__ may be undeclared before launcher decls run
  }
  return readHostScriptUrl() || readScriptUrlFromGmStorage() || buildDefaultRemoteScriptUrl()
}

/** Shorten a URL for log output. */
export function shortUrlLabel(url: string, max = 80): string {
  if (!url) return '(none)'
  return url.length > max ? `${url.slice(0, max)}...` : url
}
