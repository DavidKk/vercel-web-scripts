/**
 * editor-lib IIFE entry.
 * When `window.__VWS_EDITOR_IFRAME_MODE__` is set, runs iframe host only.
 * Otherwise registers `editor-lib` on runtime core.
 */

import { createEditorLibApi } from '@/api'
import { runIframeEditorHost } from '@/iframe-boot'

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

if (typeof window !== 'undefined' && window.__VWS_EDITOR_IFRAME_MODE__) {
  runIframeEditorHost()
} else {
  const api = createEditorLibApi()
  const core = resolveRuntimeCore()
  if (core?.register) {
    core.register('editor-lib', api, { minApiVersion: 1 })
    core.emit?.('module:editor-lib:loaded', { module: 'editor-lib' })
  }
}
