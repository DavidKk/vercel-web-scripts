/** Shared page-global permission scope stack (preset + extension gm-bridge). */
export const SCRIPT_PERMISSION_STACK_KEY = '__VWS_PERMISSION_STACK__'

export const SCRIPT_CONTENT_HASH_MAP_KEY = '__VWS_CONTENT_HASH_BY_FILE__'

/** When true, sensitive GM APIs require an active permission scope (user script module). */
export const SCRIPT_PERMISSION_ENFORCE_KEY = '__VWS_SCRIPT_PERMISSION_ENFORCE__'

/** Script keys configured for Servers → Full trust (page-world snapshot from bootstrap). */
export const PERMISSION_TRUST_SCRIPT_KEYS = '__VWS_PERMISSION_TRUST_SCRIPT_KEYS__'

export interface ScriptPermissionStackFrame {
  file: string
  contentHash?: string
}

/** Launcher sandbox roots that may hold permission scope state (`__GLOBAL__`, globalThis, window). */
export function readPermissionHosts(): Record<string, unknown>[] {
  const hosts: Record<string, unknown>[] = []
  const root = globalThis as Record<string, unknown>
  const sandbox = root.__GLOBAL__
  if (sandbox && typeof sandbox === 'object' && !Array.isArray(sandbox)) {
    hosts.push(sandbox as Record<string, unknown>)
  }
  hosts.push(root)
  if (typeof window !== 'undefined' && window !== globalThis) {
    hosts.push(window as unknown as Record<string, unknown>)
  }
  return hosts
}

function normalizePermissionStack(stack: unknown): ScriptPermissionStackFrame[] {
  if (!Array.isArray(stack)) {
    return []
  }
  return stack.filter((frame): frame is ScriptPermissionStackFrame => {
    return !!frame && typeof frame === 'object' && typeof (frame as ScriptPermissionStackFrame).file === 'string'
  })
}

/** Primary host for writes (prefer launcher sandbox `__GLOBAL__` when present). */
export function resolvePermissionHost(): Record<string, unknown> {
  return readPermissionHosts()[0] ?? (globalThis as Record<string, unknown>)
}

export function readScriptPermissionStack(): ScriptPermissionStackFrame[] {
  for (const host of readPermissionHosts()) {
    const stack = normalizePermissionStack(host[SCRIPT_PERMISSION_STACK_KEY])
    if (stack.length > 0) {
      return stack
    }
  }
  return []
}

/** True while inside a user-script permission scope (see {@link enterScriptPermissionScope}). */
export function isScriptPermissionEnforced(): boolean {
  if (readScriptPermissionStack().length > 0) {
    return true
  }
  for (const host of readPermissionHosts()) {
    if (host[SCRIPT_PERMISSION_ENFORCE_KEY] === true) {
      return true
    }
  }
  return false
}

function setScriptPermissionEnforced(enforced: boolean): void {
  const g = resolvePermissionHost()
  g[SCRIPT_PERMISSION_ENFORCE_KEY] = enforced
}

/**
 * Begin per-module permission scope (remote wrapper calls before compiled module body).
 * @param file Gist filename
 * @param contentHash Optional content hash for registry invalidation
 */
export function enterScriptPermissionScope(file: string, contentHash?: string): void {
  const g = resolvePermissionHost()
  const stack = [...readScriptPermissionStack()]
  stack.push({ file: file.trim(), contentHash: contentHash?.trim() || undefined })
  g[SCRIPT_PERMISSION_STACK_KEY] = stack
  setScriptPermissionEnforced(true)
  notifyScriptPermissionScopeEnter(file.trim(), contentHash?.trim())
}

/** Replace trust-mode script keys on the page (updated from bootstrap or services storage). */
export function setPermissionTrustScriptKeys(scriptKeys: readonly string[]): void {
  const g = resolvePermissionHost()
  g[PERMISSION_TRUST_SCRIPT_KEYS] = [...new Set(scriptKeys.map((key) => key.trim()).filter(Boolean))]
}

/** Script keys configured for Full trust on this page. */
export function readPermissionTrustScriptKeys(): ReadonlySet<string> {
  for (const host of readPermissionHosts()) {
    const value = host[PERMISSION_TRUST_SCRIPT_KEYS]
    if (Array.isArray(value)) {
      return new Set(value.filter((key): key is string => typeof key === 'string' && key.trim().length > 0))
    }
  }
  return new Set()
}

function notifyScriptPermissionScopeEnter(file: string, contentHash?: string): void {
  const hook = (globalThis as Record<string, unknown>).__VWS_ON_PERMISSION_SCOPE_ENTER__
  if (typeof hook !== 'function') {
    return
  }
  try {
    hook(file, contentHash)
  } catch {
    /* ignore hook failures */
  }
}

/** End permission scope opened by {@link enterScriptPermissionScope}. */
export function exitScriptPermissionScope(): void {
  const g = resolvePermissionHost()
  const stack = [...readScriptPermissionStack()]
  if (stack.length > 0) {
    stack.pop()
    g[SCRIPT_PERMISSION_STACK_KEY] = stack
  }
  setScriptPermissionEnforced(stack.length > 0)
}
