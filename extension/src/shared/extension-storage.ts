import {
  LEGACY_AUTO_UPDATE_SCRIPT_KEY,
  MODULE_MANIFEST_ETAG_KEY,
  PRESET_ACTIVATED_HASH_KEY,
  PRESET_CACHE_KEY,
  PRESET_ETAG_KEY,
  PRESET_PREVIOUS_HASH_KEY,
  PRESET_UPDATE_CHANNEL_KEY,
  PRESET_UPDATED_NOTIFY_KEY,
  RUNTIME_STATE_KEY_PREFIX,
  SCRIPT_BUNDLE_URL_KEY,
  SHELL_NETWORK_ENABLED_KEY,
} from '@shared/launcher-constants'

import type { ExtensionConfig } from '../types'
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from '../types'
import { matchUrl } from './match-url'

export const RULES_STORAGE_KEY = 'vws_extension_rules'
export const GM_STORAGE_PREFIX = 'vws_gm_'
export const SCRIPT_ENABLED_PREFIX = 'vws_script_enabled:'

export interface ExtensionRuleEntry {
  id: string
  wildcard: string
  script: string
  enabled: boolean
}

export function gmStorageKey(key: string): string {
  return `${GM_STORAGE_PREFIX}${key}`
}

export async function loadExtensionConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY)
  const raw = result[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined
  if (raw?.baseUrl && raw?.scriptKey) {
    return { ...DEFAULT_CONFIG, ...raw, baseUrl: raw.baseUrl.replace(/\/$/, ''), scriptKey: raw.scriptKey.trim() }
  }
  return { ...DEFAULT_CONFIG }
}

export async function loadExtensionRules(): Promise<ExtensionRuleEntry[]> {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY)
  const raw = result[RULES_STORAGE_KEY]
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter(
    (r): r is ExtensionRuleEntry =>
      r &&
      typeof r === 'object' &&
      typeof (r as ExtensionRuleEntry).id === 'string' &&
      typeof (r as ExtensionRuleEntry).wildcard === 'string' &&
      typeof (r as ExtensionRuleEntry).script === 'string'
  )
}

export function countMatchingRules(rules: ExtensionRuleEntry[], url: string): number {
  return rules.filter((r) => r.enabled !== false && r.wildcard && matchUrl(r.wildcard, url)).length
}

export function shouldInjectOnUrl(rules: ExtensionRuleEntry[], url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false
  }
  if (rules.length === 0) {
    return true
  }
  return countMatchingRules(rules, url) > 0
}

export function listKnownScriptNames(rules: ExtensionRuleEntry[], storageKeys: string[]): string[] {
  const names = new Set<string>()
  for (const r of rules) {
    if (r.script) {
      names.add(r.script)
    }
  }
  for (const key of storageKeys) {
    if (key.startsWith(SCRIPT_ENABLED_PREFIX)) {
      names.add(key.slice(SCRIPT_ENABLED_PREFIX.length))
    }
  }
  return Array.from(names).sort()
}

export async function isScriptEnabled(scriptName: string): Promise<boolean> {
  const map = await loadScriptEnabledMap([scriptName])
  return map.get(scriptName) !== false
}

/** Batch-read `vws_script_enabled:*` for many script names (default enabled when unset). */
export async function loadScriptEnabledMap(scriptNames: string[]): Promise<Map<string, boolean>> {
  if (scriptNames.length === 0) {
    return new Map()
  }
  const keys = scriptNames.map((name) => `${SCRIPT_ENABLED_PREFIX}${name}`)
  const result = await chrome.storage.local.get(keys)
  const map = new Map<string, boolean>()
  for (const name of scriptNames) {
    const key = `${SCRIPT_ENABLED_PREFIX}${name}`
    map.set(name, result[key] !== false)
  }
  return map
}

export async function setScriptEnabled(scriptName: string, enabled: boolean): Promise<void> {
  const key = `${SCRIPT_ENABLED_PREFIX}${scriptName}`
  await chrome.storage.local.set({ [key]: enabled })
}

export async function getShellNetworkEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(gmStorageKey(SHELL_NETWORK_ENABLED_KEY))
  const v = result[gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]
  if (v === true) {
    return true
  }
  if (v === false) {
    return false
  }
  const legacy = await chrome.storage.local.get(gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY))
  return legacy[gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)] === true
}

export async function setShellNetworkEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]: enabled })
}

function scopedKeys(config: ExtensionConfig): string[] {
  const scope = encodeURIComponent(`${config.baseUrl}|${config.scriptKey}`)
  return [
    `${PRESET_CACHE_KEY}:${scope}`,
    `${PRESET_ETAG_KEY}:${scope}`,
    `${PRESET_UPDATED_NOTIFY_KEY}:${scope}`,
    `${PRESET_ACTIVATED_HASH_KEY}:${scope}`,
    `${PRESET_PREVIOUS_HASH_KEY}:${scope}`,
    `${MODULE_MANIFEST_ETAG_KEY}:${scope}`,
    `${SCRIPT_BUNDLE_URL_KEY}:${scope}`,
  ]
}

/** Clear module cache and signal update (MVP update runtime). */
export async function clearRuntimeModuleCache(config: ExtensionConfig): Promise<void> {
  const keysToRemove = [
    ...scopedKeys(config),
    PRESET_CACHE_KEY,
    PRESET_ETAG_KEY,
    PRESET_ACTIVATED_HASH_KEY,
    PRESET_PREVIOUS_HASH_KEY,
    MODULE_MANIFEST_ETAG_KEY,
    SCRIPT_BUNDLE_URL_KEY,
  ]
  const gmRemoves: string[] = []
  for (const k of keysToRemove) {
    gmRemoves.push(gmStorageKey(k))
  }
  await chrome.storage.local.remove([...keysToRemove, ...gmRemoves])
  await chrome.storage.local.set({ [gmStorageKey(PRESET_UPDATE_CHANNEL_KEY)]: Date.now() })
}

/** Reset runtime state keys while keeping extension config and rules. */
export async function resetRuntimeState(config: ExtensionConfig): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const network = all[gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]
  const legacy = all[gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]
  const toRemove: string[] = []
  for (const key of Object.keys(all)) {
    if (key === CONFIG_STORAGE_KEY || key === RULES_STORAGE_KEY) {
      continue
    }
    if (key.startsWith(SCRIPT_ENABLED_PREFIX)) {
      continue
    }
    if (key.startsWith(RUNTIME_STATE_KEY_PREFIX) || key.startsWith(GM_STORAGE_PREFIX)) {
      toRemove.push(key)
    }
  }
  if (toRemove.length) {
    await chrome.storage.local.remove(toRemove)
  }
  await chrome.storage.local.set({
    [gmStorageKey(SHELL_NETWORK_ENABLED_KEY)]: network === true || network === false ? network : true,
  })
  if (legacy === true || legacy === false) {
    await chrome.storage.local.set({ [gmStorageKey(LEGACY_AUTO_UPDATE_SCRIPT_KEY)]: legacy })
  }
  await clearRuntimeModuleCache(config)
}

export async function syncRulesFromServer(config: ExtensionConfig): Promise<ExtensionRuleEntry[]> {
  const url = `${config.baseUrl}/api/tampermonkey/${encodeURIComponent(config.scriptKey)}/rule`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Rules API HTTP ${res.status}`)
  }
  const body = (await res.json()) as { code?: number; data?: Array<{ id: string; wildcard: string; script: string }> }
  if (body.code !== 0 || !Array.isArray(body.data)) {
    throw new Error('Invalid rules API response')
  }
  const rules: ExtensionRuleEntry[] = body.data.map((r) => ({
    id: r.id,
    wildcard: r.wildcard,
    script: r.script,
    enabled: true,
  }))
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules })
  const { invalidateTabMatchCache } = await import('./tab-match-cache')
  await invalidateTabMatchCache()
  return rules
}
