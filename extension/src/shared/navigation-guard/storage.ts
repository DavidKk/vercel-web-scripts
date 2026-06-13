import type { NavGuardPolicy } from '@shared/navigation-guard'
import { DEFAULT_NAV_GUARD_POLICY, NAV_GUARD_POLICY_STORAGE_KEY, parseNavGuardPolicy } from '@shared/navigation-guard'

/**
 * Load navigation guard policy from extension local storage.
 */
export async function loadNavGuardPolicy(): Promise<NavGuardPolicy> {
  const result = await chrome.storage.local.get(NAV_GUARD_POLICY_STORAGE_KEY)
  return parseNavGuardPolicy(result[NAV_GUARD_POLICY_STORAGE_KEY])
}

/**
 * Persist navigation guard policy.
 * @param policy Policy to store
 */
export async function saveNavGuardPolicy(policy: NavGuardPolicy): Promise<void> {
  const normalized = parseNavGuardPolicy(policy)
  await chrome.storage.local.set({ [NAV_GUARD_POLICY_STORAGE_KEY]: normalized })
}

/**
 * Reset navigation guard policy to defaults (log-only discovery mode).
 */
export async function resetNavGuardPolicy(): Promise<void> {
  await saveNavGuardPolicy({ ...DEFAULT_NAV_GUARD_POLICY })
}
