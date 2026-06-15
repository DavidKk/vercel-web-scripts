import { parseScriptInstalledStorageKey, resolveScriptInstalledFlag, SCRIPT_INSTALLED_PREFIX, scriptInstalledStorageKey } from '../extension-multi-service-pure'
import { normalizeScriptKey } from '../extension-services'

/** Batch-read per-script install flags for a scriptKey (default installed when unset). */
export async function loadScriptInstalledMapForScriptKey(scriptKey: string, scriptNames: string[]): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }

  const normalized = normalizeScriptKey(scriptKey)
  const scopedKeys = scriptNames.map((name) => scriptInstalledStorageKey(normalized, name))
  const result = await chrome.storage.local.get(scopedKeys)

  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const scopedKey = scriptInstalledStorageKey(normalized, name)
    map.set(name, resolveScriptInstalledFlag(result[scopedKey]))
  }
  return map
}

export async function isScriptInstalled(scriptKey: string, scriptName: string): Promise<boolean> {
  const map = await loadScriptInstalledMapForScriptKey(scriptKey, [scriptName])
  return map.get(scriptName) !== false
}

export async function setScriptInstalled(scriptKey: string, scriptName: string, installed: boolean): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  const key = scriptInstalledStorageKey(normalized, scriptName)
  await chrome.storage.local.set({ [key]: installed })
}

export { parseScriptInstalledStorageKey, SCRIPT_INSTALLED_PREFIX, scriptInstalledStorageKey }
