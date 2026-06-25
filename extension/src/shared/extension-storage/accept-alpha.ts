import { ACCEPT_ALPHA_PREFIX, acceptAlphaStorageKey, parseAcceptAlphaStorageKey } from '../extension-multi-service-pure'
import { normalizeScriptKey } from '../extension-services'

export { parseAcceptAlphaStorageKey }

/**
 * Read whether the user subscribed to alpha artifacts for one script file.
 * @param scriptKey Script key scope
 * @param file Managed script filename
 * @returns True when acceptAlpha is enabled for this file
 */
export async function readAcceptAlphaForScript(scriptKey: string, file: string): Promise<boolean> {
  const key = acceptAlphaStorageKey(scriptKey, file)
  const result = await chrome.storage.local.get([key])
  if (result[key] !== undefined) {
    return result[key] === true
  }
  const legacyKey = `${ACCEPT_ALPHA_PREFIX}${normalizeScriptKey(scriptKey)}`
  const legacy = await chrome.storage.local.get([legacyKey])
  return legacy[legacyKey] === true
}

/**
 * Load acceptAlpha flags for multiple files under one scriptKey.
 * @param scriptKey Script key scope
 * @param files Managed script filenames
 * @returns Map of file → acceptAlpha
 */
export async function readAcceptAlphaMapForScriptKey(scriptKey: string, files: string[]): Promise<Map<string, boolean>> {
  const normalized = normalizeScriptKey(scriptKey)
  const keys = files.map((file) => acceptAlphaStorageKey(normalized, file))
  const legacyKey = `${ACCEPT_ALPHA_PREFIX}${normalized}`
  const result = await chrome.storage.local.get([...keys, legacyKey])
  const legacyFallback = result[legacyKey] === true
  const map = new Map<string, boolean>()
  for (const file of files) {
    const key = acceptAlphaStorageKey(normalized, file)
    if (result[key] !== undefined) {
      map.set(file, result[key] === true)
    } else {
      map.set(file, legacyFallback)
    }
  }
  return map
}

/**
 * Persist alpha subscription preference for one script file.
 * @param scriptKey Script key scope
 * @param file Managed script filename
 * @param acceptAlpha Whether to subscribe to alpha artifacts for this file
 */
export async function setAcceptAlphaForScript(scriptKey: string, file: string, acceptAlpha: boolean): Promise<void> {
  const key = acceptAlphaStorageKey(scriptKey, file)
  await chrome.storage.local.set({ [key]: acceptAlpha })
}
