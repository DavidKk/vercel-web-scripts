import type { PermissionDisplayRow } from '@ext/ui/permissions/permission-display-rows'
import { patchAdminPolicyRow, reconcileRowsAfterAdminPolicyPatch } from '@ext/ui/permissions/permission-policy-patch'

function buildRow(overrides: Partial<PermissionDisplayRow> & Pick<PermissionDisplayRow, 'rowId' | 'registryKey'>): PermissionDisplayRow {
  return {
    request: {
      scriptKey: 'shop-key',
      file: 'shopline-debug.ts',
      capability: 'network',
      resource: 'api.example.com',
    },
    scriptKey: 'shop-key',
    file: 'shopline-debug.ts',
    capability: 'network',
    resource: 'api.example.com',
    decision: 'allow',
    scope: 'once',
    updatedAt: 100,
    policy: 'ask',
    revocable: false,
    editable: true,
    ...overrides,
  }
}

describe('patchAdminPolicyRow', () => {
  it('should normalize once row to persistent registry shape when policy is saved', () => {
    const row = buildRow({ rowId: 'once:1', registryKey: 'shop-key|shopline-debug.ts|network|api.example.com' })

    const patched = patchAdminPolicyRow(row, 'deny', 500)

    expect(patched.rowId).toBe('registry:shop-key|shopline-debug.ts|network|api.example.com')
    expect(patched.scope).toBe('persistent')
    expect(patched.policy).toBe('deny')
    expect(patched.decision).toBe('deny')
    expect(patched.updatedAt).toBe(500)
    expect(patched.tabId).toBeUndefined()
    expect(patched.revocable).toBe(true)
  })

  it('should keep allow decision for non-deny policies', () => {
    const row = buildRow({ rowId: 'registry:key', registryKey: 'key', scope: 'persistent', policy: 'allow' })

    const patched = patchAdminPolicyRow(row, 'ask', 900)

    expect(patched.decision).toBe('allow')
    expect(patched.policy).toBe('ask')
  })
})

describe('reconcileRowsAfterAdminPolicyPatch', () => {
  it('should collapse duplicate once rows for the same registry key', () => {
    const registryKey = 'shop-key|shopline-debug.ts|network|api.example.com'
    const rows = [
      buildRow({ rowId: 'once:1', registryKey, scope: 'once' }),
      buildRow({
        rowId: 'session:9:other',
        registryKey: 'other-key',
        scope: 'session',
        tabId: 9,
        policy: 'allow',
      }),
    ]

    const next = reconcileRowsAfterAdminPolicyPatch(rows, [registryKey], 'allow', 700)

    expect(next).toHaveLength(2)
    expect(next[0]?.rowId).toBe(`registry:${registryKey}`)
    expect(next[0]?.scope).toBe('persistent')
    expect(next[1]?.registryKey).toBe('other-key')
  })

  it('should patch multiple registry keys in one batch', () => {
    const firstKey = 'key-a'
    const secondKey = 'key-b'
    const rows = [buildRow({ rowId: 'once:a', registryKey: firstKey }), buildRow({ rowId: 'once:b', registryKey: secondKey, capability: 'clipboard-write', resource: '*' })]

    const next = reconcileRowsAfterAdminPolicyPatch(rows, [firstKey, secondKey], 'ask', 800)

    expect(next).toHaveLength(2)
    expect(next.every((row) => row.policy === 'ask')).toBe(true)
    expect(next.every((row) => row.scope === 'persistent')).toBe(true)
  })
})
