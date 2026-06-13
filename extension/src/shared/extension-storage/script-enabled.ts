import { isManagedScriptFilename } from '@shared/managed-script-files'

import {
  INCOGNITO_SCRIPT_ENABLED_PREFIX,
  incognitoScriptEnabledStorageKey,
  resolveScriptEnabledFlag,
  SCRIPT_ENABLED_PREFIX,
  scriptEnabledStorageKey,
} from '../extension-multi-service-pure'
import { normalizeScriptKey } from '../extension-services'
import { getPrimaryScriptKeyForLegacyReads } from './services-state'

export type ScriptEnabledContextOptions = {
  /** Lazy-fork incognito toggles from normal keys when unset. */
  incognito?: boolean
}

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

/** Files with incognito-only overrides for a scriptKey (for bootstrap union). */
export function scriptNamesFromIncognitoEnabledStorageKeysForScriptKey(scriptKey: string, storageKeys: string[]): string[] {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return []
  }
  const scopedPrefix = `${INCOGNITO_SCRIPT_ENABLED_PREFIX}${normalized}:`
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

export async function isScriptEnabled(scriptKey: string, scriptName: string, options?: ScriptEnabledContextOptions): Promise<boolean> {
  const map = await loadScriptEnabledMapForScriptKey(scriptKey, [scriptName], options)
  return map.get(scriptName) !== false
}

/** Batch-read per-script enabled flags for a scriptKey (default enabled when unset). */
export async function loadScriptEnabledMapForScriptKey(scriptKey: string, scriptNames: string[], options?: ScriptEnabledContextOptions): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }

  const normalized = normalizeScriptKey(scriptKey)
  const incognito = options?.incognito === true
  const scopedKeys = scriptNames.map((name) => scriptEnabledStorageKey(normalized, name))
  const legacyKeys = scriptNames.map((name) => `${SCRIPT_ENABLED_PREFIX}${name}`)
  const incognitoKeys = incognito ? scriptNames.map((name) => incognitoScriptEnabledStorageKey(normalized, name)) : []
  const result = await chrome.storage.local.get([...incognitoKeys, ...scopedKeys, ...legacyKeys])

  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const scopedKey = scriptEnabledStorageKey(normalized, name)
    const legacyKey = `${SCRIPT_ENABLED_PREFIX}${name}`
    const incognitoKey = incognitoScriptEnabledStorageKey(normalized, name)
    map.set(
      name,
      resolveScriptEnabledFlag({
        incognito,
        incognitoValue: incognito ? result[incognitoKey] : undefined,
        scopedValue: result[scopedKey],
        legacyValue: result[legacyKey],
      })
    )
  }
  return map
}

/** @deprecated Use {@link loadScriptEnabledMapForScriptKey} */
export async function loadScriptEnabledMap(scriptNames: string[], options?: ScriptEnabledContextOptions): Promise<Map<string, boolean>> {
  const scriptKey = await getPrimaryScriptKeyForLegacyReads()
  if (!scriptKey) {
    return new Map(scriptNames.map((name) => [name, true]))
  }
  return loadScriptEnabledMapForScriptKey(scriptKey, scriptNames, options)
}

export async function setScriptEnabled(scriptKey: string, scriptName: string, enabled: boolean, options?: ScriptEnabledContextOptions): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  const key = options?.incognito === true ? incognitoScriptEnabledStorageKey(normalized, scriptName) : scriptEnabledStorageKey(normalized, scriptName)
  await chrome.storage.local.set({ [key]: enabled })
}
