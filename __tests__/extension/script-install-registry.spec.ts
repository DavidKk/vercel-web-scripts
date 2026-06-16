import {
  clearScriptInstallRegistryEntry,
  createEmptyScriptInstallRegistry,
  recordScriptUninstallInRegistry,
  resolveInstalledFromRegistry,
} from '../../extension/src/shared/extension-storage/script-install-registry'

describe('script-install-registry', () => {
  it('keeps uninstall for the same scriptKey and file', () => {
    const registry = recordScriptUninstallInRegistry(createEmptyScriptInstallRegistry(), 'key-a', 'demo.ts', 'hash-a')
    expect(resolveInstalledFromRegistry(registry, 'key-a', 'demo.ts', 'hash-a')).toBe(false)
  })

  it('drops uninstall when content hash changes', () => {
    const registry = recordScriptUninstallInRegistry(createEmptyScriptInstallRegistry(), 'key-a', 'demo.ts', 'hash-a')
    expect(resolveInstalledFromRegistry(registry, 'key-a', 'demo.ts', 'hash-b')).toBeUndefined()
  })

  it('clears registry entry on reinstall', () => {
    const registry = clearScriptInstallRegistryEntry(recordScriptUninstallInRegistry(createEmptyScriptInstallRegistry(), 'key-a', 'demo.ts'), 'key-a', 'demo.ts')
    expect(resolveInstalledFromRegistry(registry, 'key-a', 'demo.ts')).toBeUndefined()
  })
})
