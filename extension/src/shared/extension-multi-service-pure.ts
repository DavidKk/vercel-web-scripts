import { isManagedScriptFilename } from '../../../shared/managed-script-files'
import type { ExtensionServicesState, ScriptKeyBootstrapEntry } from '../types'
import { defaultLabelFromBaseUrl, getEnabledScriptKeys, getGmScopeForScriptKey, normalizeScriptKey, resolveOtaEndpoint } from './extension-services'

export const SCRIPTKEY_RULES_PREFIX = 'vws_scriptkey_rules:'
export const SCRIPTKEY_LIST_CACHE_PREFIX = 'vws_scriptkey_script_list_cache:'
export const SCRIPT_ENABLED_PREFIX = 'vws_script_enabled:'

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

/** Parse `vws_script_enabled:{scriptKey}:{file}` or legacy `vws_script_enabled:{file}`. */
export function parseScriptEnabledStorageKey(key: string): { scriptKey: string | null; file: string } | null {
  if (!key.startsWith(SCRIPT_ENABLED_PREFIX)) {
    return null
  }
  const rest = key.slice(SCRIPT_ENABLED_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) {
    return isManagedScriptFilename(rest) ? { scriptKey: null, file: rest } : null
  }
  const scriptKey = normalizeScriptKey(rest.slice(0, colon))
  const file = rest.slice(colon + 1)
  if (!scriptKey || !isManagedScriptFilename(file)) {
    return null
  }
  return { scriptKey, file }
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
    const active = related.some((s) => s.enabled !== false)
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
  listsByScriptKey: Record<string, { files: string[]; enabledByFile: Record<string, boolean> }>
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
    entries.push({
      scriptKey: normalized,
      baseUrl: endpoint.baseUrl,
      gmScope: getGmScopeForScriptKey(normalized, state.scriptKeyMeta, endpoint.label),
      developMode: endpoint.developMode !== false,
      enabledScripts,
    })
  }
  return entries
}
