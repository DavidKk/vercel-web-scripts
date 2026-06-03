import type { LogStore } from './LogStore'

type GlobalWithLogStore = typeof globalThis & {
  __GLOBAL__?: { logStore?: LogStore }
  logStore?: LogStore
}

/**
 * Log store owned by preset-core (logger writes here).
 * preset-ui is a separate bundle — must not use its own `logStore` singleton import.
 */
export function getSharedLogStore(): LogStore | null {
  const g = (typeof __GLOBAL__ !== 'undefined' ? __GLOBAL__ : globalThis) as GlobalWithLogStore
  const fromGlobal = g.logStore ?? g.__GLOBAL__?.logStore
  if (fromGlobal && typeof fromGlobal.getLogs === 'function') {
    return fromGlobal
  }
  return null
}
