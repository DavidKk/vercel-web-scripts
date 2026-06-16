import { parseScriptInstalledStorageKey, resolveScriptInstalledFlag, SCRIPT_INSTALLED_PREFIX, scriptInstalledStorageKey } from '../extension-multi-service-pure'
import { normalizeScriptKey } from '../extension-services'
import { setScriptEnabled } from './script-enabled'
import {
  clearScriptInstallRegistryEntry,
  createEmptyScriptInstallRegistry,
  parseScriptInstallRegistryKey,
  recordScriptUninstallInRegistry,
  resolveInstalledFromRegistry,
  SCRIPT_INSTALL_REGISTRY_KEY,
  type ScriptInstallRegistry,
} from './script-install-registry'
import type { ManagedScriptListEntry } from './types'

async function readScriptInstallRegistry(): Promise<ScriptInstallRegistry> {
  const result = await chrome.storage.local.get(SCRIPT_INSTALL_REGISTRY_KEY)
  const raw = result[SCRIPT_INSTALL_REGISTRY_KEY]
  if (!raw || typeof raw !== 'object') {
    return createEmptyScriptInstallRegistry()
  }
  const entries = (raw as ScriptInstallRegistry).entries
  if (!entries || typeof entries !== 'object') {
    return createEmptyScriptInstallRegistry()
  }
  return { version: 1, entries: { ...entries } }
}

async function writeScriptInstallRegistry(registry: ScriptInstallRegistry): Promise<void> {
  await chrome.storage.local.set({ [SCRIPT_INSTALL_REGISTRY_KEY]: registry })
}

/** Batch-read per-script install flags for a scriptKey (registry + storage; default installed when unset). */
export async function loadScriptInstalledMapForScriptKey(
  scriptKey: string,
  scriptNames: string[],
  contentHashByFile?: Map<string, string | undefined>
): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }

  const normalized = normalizeScriptKey(scriptKey)
  const scopedKeys = scriptNames.map((name) => scriptInstalledStorageKey(normalized, name))
  const [result, registry] = await Promise.all([chrome.storage.local.get(scopedKeys), readScriptInstallRegistry()])

  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const scopedKey = scriptInstalledStorageKey(normalized, name)
    const fromRegistry = resolveInstalledFromRegistry(registry, normalized, name, contentHashByFile?.get(name))
    if (fromRegistry === false) {
      map.set(name, false)
      continue
    }
    map.set(name, resolveScriptInstalledFlag(result[scopedKey]))
  }
  return map
}

export async function isScriptInstalled(scriptKey: string, scriptName: string): Promise<boolean> {
  const map = await loadScriptInstalledMapForScriptKey(scriptKey, [scriptName])
  return map.get(scriptName) !== false
}

export async function setScriptInstalled(scriptKey: string, scriptName: string, installed: boolean, contentHash?: string): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  const key = scriptInstalledStorageKey(normalized, scriptName)
  const registry = await readScriptInstallRegistry()
  const nextRegistry = installed
    ? clearScriptInstallRegistryEntry(registry, normalized, scriptName)
    : recordScriptUninstallInRegistry(registry, normalized, scriptName, contentHash)
  await Promise.all([chrome.storage.local.set({ [key]: installed }), writeScriptInstallRegistry(nextRegistry)])
}

/**
 * Re-apply uninstall flags after a script list refresh (Update runtime / API sync).
 * Keeps user uninstall decisions for the same scriptKey + filename.
 */
export async function reconcileUninstalledScriptsAfterListRefresh(scriptKey: string, scripts: ManagedScriptListEntry[]): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized || scripts.length === 0) {
    return
  }

  const registry = await readScriptInstallRegistry()
  const files = new Set(scripts.map((row) => row.file))
  const contentHashByFile = new Map(scripts.map((row) => [row.file, row.contentHash]))

  for (const [entryKey, entry] of Object.entries(registry.entries)) {
    if (!entry || entry.installed !== false) {
      continue
    }
    const parsed = parseScriptInstallRegistryKey(entryKey)
    if (!parsed || parsed.scriptKey !== normalized || !files.has(parsed.file)) {
      continue
    }
    const contentHash = contentHashByFile.get(parsed.file)
    if (resolveInstalledFromRegistry(registry, normalized, parsed.file, contentHash) !== false) {
      continue
    }
    await chrome.storage.local.set({ [scriptInstalledStorageKey(normalized, parsed.file)]: false })
    await setScriptEnabled(normalized, parsed.file, false)
  }
}

export { parseScriptInstalledStorageKey, SCRIPT_INSTALL_REGISTRY_KEY, SCRIPT_INSTALLED_PREFIX, scriptInstalledStorageKey }
