/**
 * explorer-lib IIFE entry — registers `explorer-lib` on runtime core.
 */

import { createExplorerLibApi } from '@/api'

declare const __GLOBAL__: Record<string, unknown> | undefined

interface RuntimeCoreLike {
  register?: (name: string, api: unknown, options?: { minApiVersion?: number }) => void
  emit?: (event: string, payload?: unknown) => void
}

/**
 * Resolve runtime core from sandbox globals.
 */
function resolveRuntimeCore(): RuntimeCoreLike | null {
  const hosts: unknown[] = []
  try {
    if (typeof __GLOBAL__ !== 'undefined') hosts.push(__GLOBAL__)
  } catch {
    /* ignore */
  }
  try {
    hosts.push(globalThis)
  } catch {
    /* ignore */
  }
  for (const host of hosts) {
    if (host && typeof host === 'object') {
      const core = (host as Record<string, unknown>).__VWS_CORE__ as RuntimeCoreLike | undefined
      if (core && typeof core.register === 'function') {
        return core
      }
    }
  }
  return null
}

const api = createExplorerLibApi()
const core = resolveRuntimeCore()
if (core?.register) {
  core.register('explorer-lib', api, { minApiVersion: 1 })
  core.emit?.('module:explorer-lib:loaded', { module: 'explorer-lib' })
}
