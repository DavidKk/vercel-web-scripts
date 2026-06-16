import { normalizeScriptKey } from '../extension-services'

/** Persisted uninstall decisions across Update runtime / cache refresh. */
export const SCRIPT_INSTALL_REGISTRY_KEY = 'vws_script_install_registry'

export interface ScriptInstallRegistryEntry {
  installed: false
  recordedAt: number
  /** When set, a changed hash means a different script revision (defaults back to installed). */
  contentHash?: string
}

export interface ScriptInstallRegistry {
  version: 1
  entries: Record<string, ScriptInstallRegistryEntry>
}

export function createEmptyScriptInstallRegistry(): ScriptInstallRegistry {
  return { version: 1, entries: {} }
}

export function buildScriptInstallRegistryKey(scriptKey: string, file: string): string {
  return `${normalizeScriptKey(scriptKey)}:${file}`
}

export function parseScriptInstallRegistryKey(key: string): { scriptKey: string; file: string } | null {
  const colon = key.indexOf(':')
  if (colon === -1) {
    return null
  }
  const scriptKey = normalizeScriptKey(key.slice(0, colon))
  const file = key.slice(colon + 1)
  if (!scriptKey || !file) {
    return null
  }
  return { scriptKey, file }
}

/**
 * Resolve install state from registry. Returns `false` when the same script is blacklisted.
 * @returns `undefined` when registry has no opinion (caller applies default installed).
 */
export function resolveInstalledFromRegistry(registry: ScriptInstallRegistry | null | undefined, scriptKey: string, file: string, contentHash?: string): boolean | undefined {
  const entry = registry?.entries?.[buildScriptInstallRegistryKey(scriptKey, file)]
  if (!entry || entry.installed !== false) {
    return undefined
  }
  if (contentHash && entry.contentHash && entry.contentHash !== contentHash) {
    return undefined
  }
  return false
}

export function recordScriptUninstallInRegistry(registry: ScriptInstallRegistry, scriptKey: string, file: string, contentHash?: string): ScriptInstallRegistry {
  return {
    version: 1,
    entries: {
      ...registry.entries,
      [buildScriptInstallRegistryKey(scriptKey, file)]: {
        installed: false,
        recordedAt: Date.now(),
        ...(contentHash ? { contentHash } : {}),
      },
    },
  }
}

export function clearScriptInstallRegistryEntry(registry: ScriptInstallRegistry, scriptKey: string, file: string): ScriptInstallRegistry {
  const nextEntries = { ...registry.entries }
  delete nextEntries[buildScriptInstallRegistryKey(scriptKey, file)]
  return { version: 1, entries: nextEntries }
}
