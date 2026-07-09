import { VWS_WEBMCP_TOOL_REGISTRY_KEY } from './constants'
import type { VwsWebMcpToolRecord } from './types'

type RegistryMap = Map<string, VwsWebMcpToolRecord>

/**
 * Read preset / page sandbox global roots (launcher `__GLOBAL__` or window).
 * @returns Global object hosts to search
 */
export function readWebMcpGlobalHosts(): Record<string, unknown>[] {
  const hosts: Record<string, unknown>[] = []
  try {
    const globalWithSandbox = globalThis as Record<string, unknown> & { __GLOBAL__?: unknown }
    if (globalWithSandbox.__GLOBAL__ && typeof globalWithSandbox.__GLOBAL__ === 'object') {
      hosts.push(globalWithSandbox.__GLOBAL__ as Record<string, unknown>)
    }
  } catch {
    // ignore
  }
  if (typeof globalThis !== 'undefined') {
    hosts.push(globalThis as unknown as Record<string, unknown>)
  }
  if (typeof window !== 'undefined') {
    hosts.push(window as unknown as Record<string, unknown>)
  }
  return hosts
}

/**
 * Get or create the MagickMonkey WebMCP tool registry on the page sandbox.
 * @returns Mutable registry map
 */
export function getOrCreateVwsWebMcpToolRegistry(): RegistryMap {
  for (const host of readWebMcpGlobalHosts()) {
    const existing = host[VWS_WEBMCP_TOOL_REGISTRY_KEY]
    if (existing instanceof Map) {
      return existing
    }
  }

  const registry: RegistryMap = new Map()
  const primaryHost = readWebMcpGlobalHosts()[0] ?? (globalThis as unknown as Record<string, unknown>)
  primaryHost[VWS_WEBMCP_TOOL_REGISTRY_KEY] = registry
  return registry
}

/**
 * Read-only view of the registry when present.
 * @returns Registry map or null
 */
export function getVwsWebMcpToolRegistry(): ReadonlyMap<string, VwsWebMcpToolRecord> | null {
  for (const host of readWebMcpGlobalHosts()) {
    const existing = host[VWS_WEBMCP_TOOL_REGISTRY_KEY]
    if (existing instanceof Map) {
      return existing
    }
  }
  return null
}
