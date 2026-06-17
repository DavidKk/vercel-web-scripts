import { listScriptPermissionRegistryRows, removePersistentPermissionEntryByKey } from '@ext/shared/extension-storage/script-permission-registry'
import { buildScriptPermissionRegistryKey, createEmptyScriptPermissionRegistry } from '@shared/script-permission'

describe('script-permission-registry', () => {
  it('lists and removes persistent permission rows', () => {
    const request = { scriptKey: 'key-a', file: 'demo.ts', capability: 'network' as const, resource: 'example.com' }
    const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
    let registry = createEmptyScriptPermissionRegistry()
    registry.entries[key] = { decision: 'allow', remember: 'persistent', updatedAt: 100, contentHash: 'h1' }

    const rows = listScriptPermissionRegistryRows(registry)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.request.file).toBe('demo.ts')

    const next = removePersistentPermissionEntryByKey(registry, key)
    expect(listScriptPermissionRegistryRows(next)).toHaveLength(0)
  })
})
