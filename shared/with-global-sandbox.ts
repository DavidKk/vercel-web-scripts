/**
 * Build the `with(global)` target for remote/GIST script execution.
 * Must not include native window/DOM builtins — otherwise bare calls like
 * `getComputedStyle(el)` resolve through `with` and throw "Illegal invocation".
 */

/** Native globals that must not shadow the real page environment inside `with(global)`. */
const NATIVE_WITH_BLOCKLIST = new Set<string>([
  'window',
  'self',
  'globalThis',
  'top',
  'parent',
  'frames',
  'document',
  'location',
  'history',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'crypto',
  'performance',
  'screen',
  'visualViewport',
  'customElements',
  'trustedTypes',
  'console',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Request',
  'Response',
  'Headers',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'getComputedStyle',
  'matchMedia',
  'open',
  'close',
  'stop',
  'focus',
  'blur',
  'alert',
  'confirm',
  'prompt',
  'print',
  'atob',
  'btoa',
  'structuredClone',
  'queueMicrotask',
  'reportError',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
])

/**
 * Pick injected preset/GM APIs for `with(global)` without shadowing native builtins.
 * @param host Launcher sandbox (`__GLOBAL__` / globalThis) with APIs already assigned
 * @param extra Additional keys to merge onto the sandbox (e.g. grants, flags)
 */
export function buildWithGlobalExecutionSandbox(host: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const sandbox = Object.create(null) as Record<string, unknown>
  for (const key of Reflect.ownKeys(host)) {
    if (typeof key !== 'string' || NATIVE_WITH_BLOCKLIST.has(key)) {
      continue
    }
    sandbox[key] = host[key]
  }
  return Object.assign(sandbox, extra)
}

/**
 * Read a property from a proxied host, binding functions to the real target.
 * Prevents "Illegal invocation" when scripts call `unsafeWindow.getComputedStyle(...)` etc.
 */
export function readBoundProxyTargetProperty<T extends object>(target: T, prop: string | symbol): unknown {
  const value = Reflect.get(target, prop, target)
  if (typeof value === 'function') {
    return value.bind(target)
  }
  return value
}
