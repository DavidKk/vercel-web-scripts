import { permissionLogger } from '@ext/shared/logger'
import { type ScriptPermissionContext, TRUST_TIER1_PERMISSION_SEEDS } from '@shared/script-permission'
import { readPermissionTrustScriptKeys } from '@shared/script-permission-scope'

import { sendPageBridgeRequest } from './page-bridge-client'
import { rememberPagePermissionAllow, rememberPagePermissionAllowByKey } from './page-permission-allow-cache'
import { getActiveScriptPermissionContext } from './script-permission-scope'

/**
 * Synchronously seed page-world allow keys for Full trust before gated sync APIs run.
 * @param context Active script permission context
 */
export function seedTrustModePageCacheSync(context: ScriptPermissionContext): void {
  if (!readPermissionTrustScriptKeys().has(context.scriptKey.trim())) {
    return
  }
  for (const seed of TRUST_TIER1_PERMISSION_SEEDS) {
    rememberPagePermissionAllow({ ...context, capability: seed.capability, resource: seed.resource })
  }
}

/**
 * Hook invoked from {@link enterScriptPermissionScope} before user script body runs.
 */
export function onScriptPermissionScopeEnter(): void {
  const context = getActiveScriptPermissionContext()
  if (!context) {
    return
  }
  seedTrustModePageCacheSync(context)
  void sendPageBridgeRequest<string[]>('seedTrustTier1', [context], 30_000)
    .then((keys) => {
      if (!Array.isArray(keys)) {
        return
      }
      for (const key of keys) {
        if (typeof key === 'string' && key.trim()) {
          rememberPagePermissionAllowByKey(key.trim())
        }
      }
    })
    .catch((error) => {
      permissionLogger.warn('trust:seed-tier1-failed', {
        file: context.file,
        scriptKey: context.scriptKey,
        error: error instanceof Error ? error.message : String(error),
      })
    })
}

/** Install page-world permission scope hook for trust-mode sync seeding. */
export function installTrustPermissionScopeHook(): void {
  ;(globalThis as Record<string, unknown>).__VWS_ON_PERMISSION_SCOPE_ENTER__ = () => {
    onScriptPermissionScopeEnter()
  }
}
