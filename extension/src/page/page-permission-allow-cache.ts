import { buildScriptPermissionRegistryKey, type ScriptPermissionRequest } from '@shared/script-permission'
import { readPermissionHosts, resolvePermissionHost } from '@shared/script-permission-scope'

const PAGE_PERMISSION_ALLOW_KEYS = '__VWS_PERMISSION_ALLOW_KEYS__'

function readAllowKeySet(host: Record<string, unknown>): Set<string> | null {
  const value = host[PAGE_PERMISSION_ALLOW_KEYS]
  return value instanceof Set ? value : null
}

/**
 * Hydrate synchronous page-world allow keys (session + persistent registry snapshot).
 * @param keys Registry keys from background bootstrap payload
 */
export function hydratePagePermissionAllowKeys(keys: readonly string[]): void {
  const host = resolvePermissionHost()
  const set = new Set<string>()
  for (const key of keys) {
    const trimmed = key.trim()
    if (trimmed) {
      set.add(trimmed)
    }
  }

  host[PAGE_PERMISSION_ALLOW_KEYS] = set
}

/**
 * Remember an allow decision on the page so gated APIs can pass synchronously.
 * @param request Permission request that was allowed
 */
export function rememberPagePermissionAllow(request: ScriptPermissionRequest): void {
  const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
  rememberPagePermissionAllowByKey(key)
}

/**
 * Remember an allow decision by registry key (background seed / trust bootstrap).
 * @param registryKey Persistent permission registry key
 */
export function rememberPagePermissionAllowByKey(registryKey: string): void {
  const key = registryKey.trim()
  if (!key) {
    return
  }
  const host = resolvePermissionHost()
  const existing = readAllowKeySet(host) ?? new Set<string>()
  existing.add(key)
  host[PAGE_PERMISSION_ALLOW_KEYS] = existing
}

/**
 * Whether a permission request is already allowed in the page-world snapshot.
 * @param request Permission request to check
 */
export function isPagePermissionAllowed(request: ScriptPermissionRequest): boolean {
  const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
  for (const host of readPermissionHosts()) {
    const set = readAllowKeySet(host)
    if (set?.has(key)) {
      return true
    }
  }
  return false
}
