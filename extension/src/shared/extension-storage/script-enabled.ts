import { isManagedScriptFilename } from '@shared/managed-script-files'

import { SCRIPT_ENABLED_PREFIX, scriptEnabledStorageKey } from '../extension-multi-service-pure'
import { normalizeScriptKey } from '../extension-services'
import { getPrimaryScriptKeyForLegacyReads } from './services-state'

function scriptNamesFromEnabledStorageKeys(storageKeys: string[]): string[] {
  const names = new Set<string>()
  for (const key of storageKeys) {
    if (!key.startsWith(SCRIPT_ENABLED_PREFIX)) {
      continue
    }
    const rest = key.slice(SCRIPT_ENABLED_PREFIX.length)
    if (rest.includes(':')) {
      continue
    }
    if (isManagedScriptFilename(rest)) {
      names.add(rest)
    }
  }
  return Array.from(names).sort()
}

export function scriptNamesFromEnabledStorageKeysForScriptKey(scriptKey: string, storageKeys: string[]): string[] {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return []
  }
  const scopedPrefix = `${SCRIPT_ENABLED_PREFIX}${normalized}:`
  const names = new Set<string>()
  for (const key of storageKeys) {
    if (!key.startsWith(scopedPrefix)) {
      continue
    }
    const file = key.slice(scopedPrefix.length)
    if (isManagedScriptFilename(file)) {
      names.add(file)
    }
  }
  return Array.from(names).sort()
}

export function fallbackScriptListFromEnabledKeys(): Promise<Array<{ file: string; name: string }>> {
  return chrome.storage.local.get(null).then((all) => scriptNamesFromEnabledStorageKeys(Object.keys(all)).map((file) => ({ file, name: file })))
}

export function fallbackScriptListFromEnabledKeysForScriptKey(scriptKey: string): Promise<Array<{ file: string; name: string }>> {
  const normalized = normalizeScriptKey(scriptKey)
  return chrome.storage.local.get(null).then((all) => scriptNamesFromEnabledStorageKeysForScriptKey(normalized, Object.keys(all)).map((file) => ({ file, name: file })))
}

export async function isScriptEnabled(scriptKey: string, scriptName: string): Promise<boolean> {
  const map = await loadScriptEnabledMapForScriptKey(scriptKey, [scriptName])
  return map.get(scriptName) !== false
}

/** Batch-read per-script enabled flags for a scriptKey (default enabled when unset). */
export async function loadScriptEnabledMapForScriptKey(scriptKey: string, scriptNames: string[]): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }

  const normalized = normalizeScriptKey(scriptKey)
  const scopedKeys = scriptNames.map((name) => scriptEnabledStorageKey(normalized, name))
  const legacyKeys = scriptNames.map((name) => `${SCRIPT_ENABLED_PREFIX}${name}`)
  const result = await chrome.storage.local.get([...scopedKeys, ...legacyKeys])

  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const scopedKey = scriptEnabledStorageKey(normalized, name)
    const legacyKey = `${SCRIPT_ENABLED_PREFIX}${name}`
    if (scopedKey in result) {
      map.set(name, result[scopedKey] !== false)
      continue
    }
    map.set(name, result[legacyKey] !== false)
  }
  return map
}

/** @deprecated Use {@link loadScriptEnabledMapForScriptKey} */
export async function loadScriptEnabledMap(scriptNames: string[]): Promise<Map<string, boolean>> {
  const scriptKey = await getPrimaryScriptKeyForLegacyReads()
  if (!scriptKey) {
    return new Map(scriptNames.map((name) => [name, true]))
  }
  return loadScriptEnabledMapForScriptKey(scriptKey, scriptNames)
}

export async function setScriptEnabled(scriptKey: string, scriptName: string, enabled: boolean): Promise<void> {
  const key = scriptEnabledStorageKey(scriptKey, scriptName)
  await chrome.storage.local.set({ [key]: enabled })
}
