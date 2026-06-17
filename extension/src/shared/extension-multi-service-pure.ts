import { isManagedScriptFilename } from '@shared/managed-script-files'

import type { ExtensionServicesState, ScriptKeyBootstrapEntry } from '../types'
import { defaultLabelFromBaseUrl, getEnabledScriptKeys, getGmScopeForScriptKey, normalizeScriptKey, resolveOtaEndpoint } from './extension-services'

export const SCRIPTKEY_RULES_PREFIX = 'vws_scriptkey_rules:'
export const SCRIPTKEY_LIST_CACHE_PREFIX = 'vws_scriptkey_script_list_cache:'
export const SCRIPT_ENABLED_PREFIX = 'vws_script_enabled:'
/** Incognito-only fork of per-script toggles; reads fall back to {@link SCRIPT_ENABLED_PREFIX}. */
export const INCOGNITO_SCRIPT_ENABLED_PREFIX = 'vws_incognito_script_enabled:'
/** Per-script install state (`false` = uninstalled / blacklisted). Unset defaults to installed. */
export const SCRIPT_INSTALLED_PREFIX = 'vws_script_installed:'

/** Storage key for scriptKey-scoped RULE bucket. */
export function scriptKeyRulesStorageKey(scriptKey: string): string {
  return `${SCRIPTKEY_RULES_PREFIX}${normalizeScriptKey(scriptKey)}`
}

/** Storage key for scriptKey-scoped script list cache. */
export function scriptKeyListCacheStorageKey(scriptKey: string): string {
  return `${SCRIPTKEY_LIST_CACHE_PREFIX}${normalizeScriptKey(scriptKey)}`
}

/** Storage key for scriptKey-scoped per-file enabled toggle. */
export function scriptEnabledStorageKey(scriptKey: string, file: string): string {
  return `${SCRIPT_ENABLED_PREFIX}${normalizeScriptKey(scriptKey)}:${file}`
}

/** Storage key for incognito fork of a scriptKey-scoped per-file enabled toggle. */
export function incognitoScriptEnabledStorageKey(scriptKey: string, file: string): string {
  return `${INCOGNITO_SCRIPT_ENABLED_PREFIX}${normalizeScriptKey(scriptKey)}:${file}`
}

/** Storage key for scriptKey-scoped per-file install toggle. */
export function scriptInstalledStorageKey(scriptKey: string, file: string): string {
  return `${SCRIPT_INSTALLED_PREFIX}${normalizeScriptKey(scriptKey)}:${file}`
}

export type ParsedScriptInstalledStorageKey = {
  scriptKey: string
  file: string
}

/** Parse scoped script installed keys. */
export function parseScriptInstalledStorageKey(key: string): ParsedScriptInstalledStorageKey | null {
  if (!key.startsWith(SCRIPT_INSTALLED_PREFIX)) {
    return null
  }
  const rest = key.slice(SCRIPT_INSTALLED_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) {
    return null
  }
  const scriptKey = normalizeScriptKey(rest.slice(0, colon))
  const file = rest.slice(colon + 1)
  if (!scriptKey || !isManagedScriptFilename(file)) {
    return null
  }
  return { scriptKey, file }
}

/**
 * Resolve installed flag: unset defaults to installed (`true`).
 */
export function resolveScriptInstalledFlag(value: unknown): boolean {
  return value !== false
}

export type ParsedScriptEnabledStorageKey = {
  scriptKey: string | null
  file: string
  /** True when parsed from {@link INCOGNITO_SCRIPT_ENABLED_PREFIX}. */
  incognito: boolean
}

/**
 * Resolve enabled flag with lazy fork: incognito bucket first, then normal scoped/legacy, default true.
 */
export function resolveScriptEnabledFlag(params: { incognito?: boolean; incognitoValue: unknown; scopedValue: unknown; legacyValue: unknown }): boolean {
  if (params.incognito && params.incognitoValue !== undefined) {
    return params.incognitoValue !== false
  }
  if (params.scopedValue !== undefined) {
    return params.scopedValue !== false
  }
  if (params.legacyValue !== undefined) {
    return params.legacyValue !== false
  }
  return true
}

/** Parse scoped script enabled keys (normal or incognito fork). */
export function parseScriptEnabledStorageKey(key: string): ParsedScriptEnabledStorageKey | null {
  let prefix = SCRIPT_ENABLED_PREFIX
  let incognito = false
  if (key.startsWith(INCOGNITO_SCRIPT_ENABLED_PREFIX)) {
    prefix = INCOGNITO_SCRIPT_ENABLED_PREFIX
    incognito = true
  } else if (!key.startsWith(SCRIPT_ENABLED_PREFIX)) {
    return null
  }
  const rest = key.slice(prefix.length)
  const colon = rest.indexOf(':')
  if (colon === -1) {
    return isManagedScriptFilename(rest) ? { scriptKey: null, file: rest, incognito } : null
  }
  const scriptKey = normalizeScriptKey(rest.slice(0, colon))
  const file = rest.slice(colon + 1)
  if (!scriptKey || !isManagedScriptFilename(file)) {
    return null
  }
  return { scriptKey, file, incognito }
}

export interface ScriptKeyGroupMeta {
  scriptKey: string
  active: boolean
  serviceLabels: string[]
  /** First enabled service label for this scriptKey (OTA representative); falls back to first related service. */
  primaryServiceLabel: string
  editorBaseUrl: string
}

/** Unique scriptKeys in Service list order (deduped), with associated Service labels. */
export function buildScriptKeyGroupMetaFromState(state: ExtensionServicesState): ScriptKeyGroupMeta[] {
  const seen = new Set<string>()
  const groups: ScriptKeyGroupMeta[] = []

  for (const service of state.services) {
    const scriptKey = normalizeScriptKey(service.scriptKey)
    if (!scriptKey || seen.has(scriptKey)) {
      continue
    }
    seen.add(scriptKey)

    const related = state.services.filter((s) => normalizeScriptKey(s.scriptKey) === scriptKey)
    const active = related.some((s) => s.enabled)
    const ota = resolveOtaEndpoint(scriptKey, state.services)
    const editorBaseUrl = ota?.baseUrl ?? related[0]?.baseUrl ?? ''
    const displayService = ota ?? related[0]
    const primaryServiceLabel = displayService ? displayService.label.trim() || defaultLabelFromBaseUrl(displayService.baseUrl) : ''

    groups.push({
      scriptKey,
      active,
      serviceLabels: related.map((s) => s.label.trim() || defaultLabelFromBaseUrl(s.baseUrl)),
      primaryServiceLabel,
      editorBaseUrl,
    })
  }

  return groups
}

/** Build bootstrap entries from services state (pure; for tests and async loader). */
export function buildScriptKeyBootstrapEntriesFromState(
  state: ExtensionServicesState,
  listsByScriptKey: Record<string, { files: string[]; enabledByFile: Record<string, boolean>; contentHashByFile?: Record<string, string> }>
): ScriptKeyBootstrapEntry[] {
  const entries: ScriptKeyBootstrapEntry[] = []
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const endpoint = resolveOtaEndpoint(scriptKey, state.services)
    if (!endpoint) {
      continue
    }
    const normalized = normalizeScriptKey(scriptKey)
    const list = listsByScriptKey[normalized] ?? { files: [], enabledByFile: {} }
    const enabledScripts: Record<string, boolean> = {}
    for (const file of list.files) {
      enabledScripts[file] = list.enabledByFile[file] !== false
    }
    for (const [file, enabled] of Object.entries(list.enabledByFile)) {
      if (!(file in enabledScripts)) {
        enabledScripts[file] = enabled !== false
      }
    }
    entries.push({
      scriptKey: normalized,
      baseUrl: endpoint.baseUrl,
      gmScope: getGmScopeForScriptKey(normalized, state.scriptKeyMeta, endpoint.label, endpoint.baseUrl),
      developMode: endpoint.developMode === true,
      enabledScripts,
      ...(list.contentHashByFile && Object.keys(list.contentHashByFile).length > 0 ? { contentHashByFile: list.contentHashByFile } : {}),
    })
  }
  return entries
}
