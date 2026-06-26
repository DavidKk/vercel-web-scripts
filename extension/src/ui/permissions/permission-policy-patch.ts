import type { PermissionDisplayRow, PermissionPolicy } from './permission-display-rows'

/**
 * Apply admin policy override fields to one display row (mirrors persistent registry shape).
 * @param row Source permission row
 * @param policy Admin policy to apply
 * @param updatedAt Timestamp for Updated column
 * @returns Patched row with registry row id
 */
export function patchAdminPolicyRow(row: PermissionDisplayRow, policy: PermissionPolicy, updatedAt: number): PermissionDisplayRow {
  return {
    ...row,
    rowId: `registry:${row.registryKey}`,
    policy,
    decision: policy === 'deny' ? 'deny' : 'allow',
    scope: 'persistent',
    tabId: undefined,
    revocable: true,
    editable: true,
    updatedAt,
  }
}

/**
 * Collapse once/session duplicates and patch rows after admin policy save.
 * @param rows Current permission display rows
 * @param registryKeys Registry keys updated by admin save
 * @param policy Applied admin policy
 * @param updatedAt Timestamp shared across patched rows
 * @returns Rows with one persistent entry per updated registry key
 */
export function reconcileRowsAfterAdminPolicyPatch(
  rows: readonly PermissionDisplayRow[],
  registryKeys: readonly string[],
  policy: PermissionPolicy,
  updatedAt: number
): PermissionDisplayRow[] {
  if (registryKeys.length === 0) {
    return [...rows]
  }

  const keySet = new Set(registryKeys)
  const patchedKeys = new Set<string>()
  const result: PermissionDisplayRow[] = []

  for (const row of rows) {
    if (!keySet.has(row.registryKey)) {
      result.push(row)
      continue
    }
    if (patchedKeys.has(row.registryKey)) {
      continue
    }
    patchedKeys.add(row.registryKey)
    result.push(patchAdminPolicyRow(row, policy, updatedAt))
  }

  return result
}
