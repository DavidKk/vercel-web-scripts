import type { ExtensionConfig } from '../../types'
import { scriptKeyRulesStorageKey } from '../extension-multi-service-pure'
import { formatScriptSelectLabel, getEnabledScriptKeys, normalizeBaseUrl, normalizeScriptKey, resolveOtaEndpoint } from '../extension-services'
import { matchUrl } from '../match-url'
import { RULES_STORAGE_KEY } from './constants'
import { dedupeManagedScriptListByFile, loadManagedScriptListFromCacheForScriptKey, loadScriptKeyScriptsGroupsFromCache } from './script-list-cache'
import { ensureExtensionServicesState, serviceProfileToExtensionConfig } from './services-state'
import type { ExtensionRuleEntry, QuickAddRuleContextItem } from './types'

function parseExtensionRules(raw: unknown): ExtensionRuleEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter(
      (r): r is ExtensionRuleEntry =>
        r &&
        typeof r === 'object' &&
        typeof (r as ExtensionRuleEntry).id === 'string' &&
        typeof (r as ExtensionRuleEntry).wildcard === 'string' &&
        typeof (r as ExtensionRuleEntry).script === 'string'
    )
    .map((rule) => ({
      ...rule,
      mode: rule.mode === 'include' || rule.mode === 'exclude' || rule.mode === 'script' ? rule.mode : 'script',
    }))
}

export async function loadScriptKeyRules(scriptKey: string): Promise<ExtensionRuleEntry[]> {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return []
  }
  const scopedKey = scriptKeyRulesStorageKey(normalized)
  const result = await chrome.storage.local.get(scopedKey)
  const scopedRules = parseExtensionRules(result[scopedKey])
  if (scopedRules.length > 0) {
    return scopedRules
  }

  const legacy = await chrome.storage.local.get(RULES_STORAGE_KEY)
  const legacyRules = parseExtensionRules(legacy[RULES_STORAGE_KEY])
  const state = await ensureExtensionServicesState()
  const primaryKey = getEnabledScriptKeys(state.services)[0] ?? state.services[0]?.scriptKey
  if (legacyRules.length > 0 && primaryKey && normalizeScriptKey(primaryKey) === normalized) {
    return legacyRules
  }
  return []
}

/**
 * Persist RULE entries for a scriptKey capability bucket.
 * @param scriptKey Script key scope
 * @param rules Rule entries to store
 */
export async function saveScriptKeyRules(scriptKey: string, rules: ExtensionRuleEntry[]): Promise<void> {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return
  }
  await chrome.storage.local.set({ [scriptKeyRulesStorageKey(normalized)]: rules })
}

/**
 * Add one local rule into a scriptKey bucket (dedupe by script + wildcard).
 * Returns true when created, false when duplicated.
 */
export async function addScriptKeyRule(scriptKey: string, script: string, wildcard: string, mode: 'include' | 'exclude' = 'include'): Promise<boolean> {
  const normalizedScriptKey = normalizeScriptKey(scriptKey)
  const scriptName = script.trim()
  const pattern = wildcard.trim()
  if (!normalizedScriptKey || !scriptName || !pattern) {
    throw new Error('Missing script key, script, or wildcard.')
  }

  const rules = await loadScriptKeyRules(normalizedScriptKey)
  const exists = rules.some((rule) => rule.script === scriptName && rule.wildcard === pattern && (rule.mode ?? 'script') === mode)
  if (exists) {
    return false
  }

  const next: ExtensionRuleEntry[] = [
    ...rules,
    {
      id: crypto.randomUUID(),
      script: scriptName,
      wildcard: pattern,
      enabled: true,
      mode,
    },
  ]
  await saveScriptKeyRules(normalizedScriptKey, next)
  const { invalidateTabMatchCache } = await import('../tab-match-cache')
  await invalidateTabMatchCache()
  return true
}

/** Remove one exact local rule in a scriptKey bucket. */
export async function removeScriptKeyRule(scriptKey: string, script: string, wildcard: string, mode: 'include' | 'exclude' = 'include'): Promise<boolean> {
  const normalizedScriptKey = normalizeScriptKey(scriptKey)
  const scriptName = script.trim()
  const pattern = wildcard.trim()
  if (!normalizedScriptKey || !scriptName || !pattern) {
    throw new Error('Missing script key, script, or wildcard.')
  }

  const rules = await loadScriptKeyRules(normalizedScriptKey)
  const next = rules.filter((rule) => !(rule.script === scriptName && rule.wildcard === pattern && (rule.mode ?? 'script') === mode))
  if (next.length === rules.length) {
    return false
  }

  await saveScriptKeyRules(normalizedScriptKey, next)
  const { invalidateTabMatchCache } = await import('../tab-match-cache')
  await invalidateTabMatchCache()
  return true
}

/** Load popup quick-add context from local cache for enabled script keys. */
export async function loadQuickAddRuleContext(activeUrl?: string): Promise<QuickAddRuleContextItem[]> {
  const groups = await loadScriptKeyScriptsGroupsFromCache()
  const result: QuickAddRuleContextItem[] = []
  for (const group of groups) {
    if (!group.active || group.scripts.length === 0) {
      continue
    }

    const rules = activeUrl ? await loadScriptKeyRules(group.scriptKey) : []
    const scripts = dedupeManagedScriptListByFile(group.scripts).map((script) => {
      if (!activeUrl) {
        return script
      }
      const scopedRules = rules.filter((rule) => rule.script === script.file)
      const decision = resolveRuleDecision(scopedRules, activeUrl)
      return { ...script, matchedOnActiveTab: decision.matched }
    })

    result.push({
      scriptKey: group.scriptKey,
      serviceLabels: group.serviceLabels,
      scripts,
    })
  }
  return result
}

/** Flatten quick-add script groups into select options (deduped, disambiguate same display names). */
export function buildQuickRuleScriptSelectOptions(items: QuickAddRuleContextItem[]): Array<{ value: string; label: string; matched: boolean }> {
  const showScriptKeySuffix = items.length > 1
  const rows: Array<{ value: string; label: string; matched: boolean }> = []
  const seenValues = new Set<string>()

  for (const item of items) {
    for (const script of item.scripts) {
      const value = `${item.scriptKey}|${script.file}`
      if (seenValues.has(value)) {
        continue
      }
      seenValues.add(value)
      rows.push({
        value,
        label: formatScriptSelectLabel(script.name || script.file, item.scriptKey, showScriptKeySuffix),
        matched: script.matchedOnActiveTab === true,
      })
    }
  }

  const labelCounts = new Map<string, number>()
  for (const row of rows) {
    labelCounts.set(row.label, (labelCounts.get(row.label) ?? 0) + 1)
  }

  return rows.map((row) => {
    if ((labelCounts.get(row.label) ?? 0) <= 1) {
      return row
    }
    const file = row.value.slice(row.value.indexOf('|') + 1)
    return { ...row, label: `${row.label} — ${file}` }
  })
}

/** Local editable rules (include/exclude) grouped from enabled script keys. */
export async function loadLocalRulesForEnabledScriptKeys(): Promise<
  Array<{ id: string; scriptKey: string; script: string; scriptName: string; scriptFile: string; wildcard: string; mode: 'include' | 'exclude' }>
> {
  const state = await ensureExtensionServicesState()
  const rows: Array<{ id: string; scriptKey: string; script: string; scriptName: string; scriptFile: string; wildcard: string; mode: 'include' | 'exclude' }> = []
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const scripts = await loadManagedScriptListFromCacheForScriptKey(scriptKey)
    const nameByFile = new Map<string, string>(scripts.map((item) => [item.file, item.name || item.file]))
    const rules = await loadScriptKeyRules(scriptKey)
    for (const rule of rules) {
      const mode = rule.mode ?? 'script'
      if (mode !== 'include' && mode !== 'exclude') {
        continue
      }
      const scriptFile = rule.script
      const scriptName = nameByFile.get(scriptFile) || scriptFile
      rows.push({
        id: rule.id,
        scriptKey,
        script: scriptFile,
        scriptName,
        scriptFile,
        wildcard: rule.wildcard,
        mode,
      })
    }
  }
  rows.sort((a, b) => a.scriptName.localeCompare(b.scriptName) || a.scriptFile.localeCompare(b.scriptFile) || a.wildcard.localeCompare(b.wildcard))
  return rows
}

/**
 * Merge RULE from all enabled unique scriptKeys (union for tab-match / inject gating).
 * @returns Combined rule list in enabled scriptKey list order
 */
export async function loadMergedRules(): Promise<ExtensionRuleEntry[]> {
  const state = await ensureExtensionServicesState()
  const scriptKeys = getEnabledScriptKeys(state.services)
  const merged: ExtensionRuleEntry[] = []
  for (const scriptKey of scriptKeys) {
    const rules = await loadScriptKeyRules(scriptKey)
    merged.push(...rules)
  }
  return merged
}

/**
 * @deprecated Use {@link loadMergedRules} or {@link loadScriptKeyRules}.
 */
export async function loadExtensionRules(): Promise<ExtensionRuleEntry[]> {
  return loadMergedRules()
}

export function countMatchingRules(rules: ExtensionRuleEntry[], url: string): number {
  const scriptNames = new Set<string>()
  for (const rule of rules) {
    if (rule.enabled !== false && rule.script) {
      scriptNames.add(rule.script)
    }
  }

  let matched = 0
  for (const scriptName of scriptNames) {
    const scoped = rules.filter((rule) => rule.enabled !== false && rule.script === scriptName)
    const decision = resolveRuleDecision(scoped, url)
    if (decision.matched) {
      matched += 1
    }
  }
  return matched
}

function matchesRuleMode(rules: ExtensionRuleEntry[], url: string, mode: 'include' | 'exclude' | 'script'): boolean {
  return rules.some((rule) => rule.enabled !== false && (rule.mode ?? 'script') === mode && rule.wildcard && matchUrl(rule.wildcard, url))
}

export function resolveRuleDecision(rules: ExtensionRuleEntry[], url: string): { matched: boolean; source: 'include' | 'exclude' | 'script' | 'none' } {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { matched: false, source: 'none' }
  }
  if (matchesRuleMode(rules, url, 'include')) {
    return { matched: true, source: 'include' }
  }
  if (matchesRuleMode(rules, url, 'exclude')) {
    return { matched: false, source: 'exclude' }
  }
  if (matchesRuleMode(rules, url, 'script')) {
    return { matched: true, source: 'script' }
  }
  if (rules.length === 0) {
    return { matched: true, source: 'none' }
  }
  return { matched: false, source: 'none' }
}

export function shouldInjectOnUrl(rules: ExtensionRuleEntry[], url: string): boolean {
  return resolveRuleDecision(rules, url).matched
}

export async function syncRulesFromServer(config: ExtensionConfig): Promise<ExtensionRuleEntry[]> {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const scriptKey = normalizeScriptKey(config.scriptKey)
  if (!baseUrl || !scriptKey) {
    throw new Error('Missing Server URL or Script Key.')
  }

  const url = `${baseUrl}/api/tampermonkey/${encodeURIComponent(scriptKey)}/rule`
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
    mode: 'script',
  }))
  await saveScriptKeyRules(scriptKey, rules)
  const { invalidateTabMatchCache } = await import('../tab-match-cache')
  await invalidateTabMatchCache()
  return rules
}

/**
 * Sync RULE for each enabled unique scriptKey using its OTA representative endpoint.
 * @returns Per scriptKey sync results
 */
export async function syncRulesForEnabledScriptKeys(): Promise<Array<{ scriptKey: string; count: number }>> {
  const state = await ensureExtensionServicesState()
  const results: Array<{ scriptKey: string; count: number }> = []
  for (const scriptKey of getEnabledScriptKeys(state.services)) {
    const endpoint = resolveOtaEndpoint(scriptKey, state.services)
    if (!endpoint) {
      continue
    }
    const rules = await syncRulesFromServer(serviceProfileToExtensionConfig(endpoint))
    results.push({ scriptKey, count: rules.length })
  }
  return results
}
