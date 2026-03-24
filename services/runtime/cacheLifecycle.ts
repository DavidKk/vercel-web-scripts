/**
 * Runtime cache key set for one module scope.
 */
export interface RuntimeModuleCacheKeys {
  contentKey: string
  hashKey: string
  activatedHashKey: string
  previousHashKey: string
  updatedAtKey: string
}

/**
 * Build scoped runtime cache keys for module lifecycle.
 * @param moduleId Runtime module identifier
 * @param scope Cache scope string (for example baseUrl + script key)
 * @returns Cache keys for lifecycle operations
 */
export function buildRuntimeModuleCacheKeys(moduleId: string, scope: string): RuntimeModuleCacheKeys {
  const normalizedScope = encodeURIComponent(scope)
  const base = `vws_module:${moduleId}:${normalizedScope}`
  return {
    contentKey: `${base}:content`,
    hashKey: `${base}:hash`,
    activatedHashKey: `${base}:activated`,
    previousHashKey: `${base}:previous`,
    updatedAtKey: `${base}:updatedAt`,
  }
}
