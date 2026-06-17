import { formatPermissionCapabilityLabel, type ScriptPermissionAdminPolicy, type ScriptPermissionDecision, type ScriptPermissionRequest } from '@shared/script-permission'

export type PermissionScope = 'persistent' | 'session' | 'once'

/** Simplified admin policy: allow (persistent), ask (no stored grant), deny (persistent). */
export type PermissionPolicy = 'allow' | 'ask' | 'deny'

export interface PermissionDisplayRow {
  rowId: string
  registryKey: string
  request: ScriptPermissionRequest
  scriptKey: string
  file: string
  capability: string
  resource: string
  decision: ScriptPermissionDecision
  scope: PermissionScope
  tabId?: number
  updatedAt: number
  policy: PermissionPolicy
  revocable: boolean
  editable: boolean
}

export interface PermissionScriptGroup {
  groupKey: string
  scriptKey: string
  file: string
  scriptName: string
  index: number
  rows: PermissionDisplayRow[]
}

interface RegistryEntryRow {
  key: string
  request: ScriptPermissionRequest
  entry: { decision: ScriptPermissionDecision; updatedAt: number; adminPolicy?: ScriptPermissionAdminPolicy }
}

interface SessionEntryRow {
  tabId: number
  key: string
  request: ScriptPermissionRequest | null
  decision: ScriptPermissionDecision
}

interface HistoryEntryRow {
  id: string
  tabId: number
  key: string
  request: ScriptPermissionRequest
  decision: ScriptPermissionDecision
  remember: PermissionScope
  decidedAt: number
}

export function resolvePermissionPolicy(scope: PermissionScope, decision: ScriptPermissionDecision): PermissionPolicy {
  if (scope === 'persistent' || scope === 'session') {
    return decision === 'allow' ? 'allow' : 'deny'
  }
  return decision === 'deny' ? 'deny' : 'ask'
}

export function resolveRegistryAdminPolicy(entry: { decision: ScriptPermissionDecision; adminPolicy?: ScriptPermissionAdminPolicy }): PermissionPolicy {
  if (entry.adminPolicy) {
    return entry.adminPolicy
  }
  return entry.decision === 'allow' ? 'allow' : 'deny'
}

/** Whether a script file is an internal debug helper (e.g. `__debug-command-palette__.ts`). */
export function isDebugPermissionScriptFile(file: string): boolean {
  const normalized = file.trim().toLowerCase()
  return normalized.startsWith('__debug-') || normalized.startsWith('__debug_')
}

const DEBUG_SCRIPT_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  '__debug-command-palette__.ts': 'Command palette',
  '__debug-permission-test__.ts': 'Permission test',
}

/**
 * Friendly admin label for internal debug script files when no script list name exists.
 * @param file Script filename from permission registry
 * @returns Display name, or null when file is not a debug helper
 */
export function resolveDebugScriptDisplayName(file: string): string | null {
  if (!isDebugPermissionScriptFile(file)) {
    return null
  }
  const normalized = file.trim().toLowerCase()
  const known = DEBUG_SCRIPT_DISPLAY_NAMES[normalized]
  if (known) {
    return known
  }
  const match = normalized.match(/^__debug[-_](.+?)(?:__)?\.[cm]?tsx?$/)
  if (!match?.[1]) {
    return 'Debug script'
  }
  return match[1]
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveScriptDisplayName(groupKey: string, file: string, scriptNameByKey: ReadonlyMap<string, string>): string {
  const cached = scriptNameByKey.get(groupKey)?.trim()
  if (cached && cached.toLowerCase() !== file.trim().toLowerCase()) {
    return cached
  }
  return resolveDebugScriptDisplayName(file) ?? cached ?? file
}

function comparePermissionRowsWithinScript(a: PermissionDisplayRow, b: PermissionDisplayRow): number {
  const byUpdated = b.updatedAt - a.updatedAt
  if (byUpdated !== 0) {
    return byUpdated
  }
  const byCapability = a.capability.localeCompare(b.capability)
  if (byCapability !== 0) {
    return byCapability
  }
  return a.resource.localeCompare(b.resource)
}

function comparePermissionScriptGroups(a: PermissionScriptGroup, b: PermissionScriptGroup): number {
  const aDebug = isDebugPermissionScriptFile(a.file)
  const bDebug = isDebugPermissionScriptFile(b.file)
  if (aDebug !== bDebug) {
    return aDebug ? 1 : -1
  }
  const aUpdated = Math.max(...a.rows.map((row) => row.updatedAt))
  const bUpdated = Math.max(...b.rows.map((row) => row.updatedAt))
  if (bUpdated !== aUpdated) {
    return bUpdated - aUpdated
  }
  const byFile = a.file.localeCompare(b.file)
  if (byFile !== 0) {
    return byFile
  }
  return a.scriptKey.localeCompare(b.scriptKey)
}

/** Group permission rows by script file for merged admin table cells. */
export function groupPermissionRowsByScript(rows: readonly PermissionDisplayRow[], scriptNameByKey: ReadonlyMap<string, string> = new Map()): PermissionScriptGroup[] {
  const grouped = new Map<string, PermissionDisplayRow[]>()
  for (const row of rows) {
    const groupKey = `${row.scriptKey}:${row.file}`
    const existing = grouped.get(groupKey) ?? []
    existing.push(row)
    grouped.set(groupKey, existing)
  }

  const groups = [...grouped.entries()].map(([groupKey, groupRows]) => {
    const first = groupRows[0]
    if (!first) {
      throw new Error('Permission group is empty')
    }
    return {
      groupKey,
      scriptKey: first.scriptKey,
      file: first.file,
      scriptName: resolveScriptDisplayName(groupKey, first.file, scriptNameByKey),
      index: 0,
      rows: [...groupRows].sort(comparePermissionRowsWithinScript),
    }
  })

  groups.sort(comparePermissionScriptGroups)
  groups.forEach((group, index) => {
    group.index = index + 1
  })
  return groups
}

function comparePermissionDisplayRows(a: PermissionDisplayRow, b: PermissionDisplayRow): number {
  const aDebug = isDebugPermissionScriptFile(a.file)
  const bDebug = isDebugPermissionScriptFile(b.file)
  if (aDebug !== bDebug) {
    return aDebug ? 1 : -1
  }
  const byUpdated = b.updatedAt - a.updatedAt
  if (byUpdated !== 0) {
    return byUpdated
  }
  return a.file.localeCompare(b.file)
}

function toDisplayRow(base: Omit<PermissionDisplayRow, 'scriptKey' | 'file' | 'capability' | 'resource' | 'policy'>, policyOverride?: PermissionPolicy): PermissionDisplayRow {
  return {
    ...base,
    scriptKey: base.request.scriptKey,
    file: base.request.file,
    capability: formatPermissionCapabilityLabel(base.request.capability),
    resource: base.request.resource,
    policy: policyOverride ?? resolvePermissionPolicy(base.scope, base.decision),
  }
}

/**
 * Build one admin row per permission key from active grants, with optional latest once-only audit row.
 */
export function buildPermissionDisplayRows(input: {
  registryEntries: RegistryEntryRow[]
  sessionEntries: SessionEntryRow[]
  historyEntries: HistoryEntryRow[]
}): PermissionDisplayRow[] {
  const rows: PermissionDisplayRow[] = []
  const activeKeys = new Set<string>()

  for (const row of input.registryEntries) {
    activeKeys.add(row.key)
    rows.push(
      toDisplayRow(
        {
          rowId: `registry:${row.key}`,
          registryKey: row.key,
          request: row.request,
          decision: row.entry.decision,
          scope: 'persistent',
          updatedAt: row.entry.updatedAt,
          revocable: true,
          editable: true,
        },
        resolveRegistryAdminPolicy(row.entry)
      )
    )
  }

  for (const row of input.sessionEntries) {
    if (!row.request || activeKeys.has(row.key)) {
      continue
    }
    activeKeys.add(row.key)
    const sessionUpdatedAt = input.historyEntries
      .filter((entry) => entry.key === row.key && entry.remember === 'session' && entry.tabId === row.tabId)
      .reduce((max, entry) => Math.max(max, entry.decidedAt), 0)
    rows.push(
      toDisplayRow({
        rowId: `session:${row.tabId}:${row.key}`,
        registryKey: row.key,
        request: row.request,
        decision: row.decision,
        scope: 'session',
        tabId: row.tabId,
        updatedAt: sessionUpdatedAt || Date.now(),
        revocable: true,
        editable: true,
      })
    )
  }

  const latestOnceByKey = new Map<string, HistoryEntryRow>()
  for (const row of input.historyEntries) {
    if (row.remember !== 'once' || activeKeys.has(row.key)) {
      continue
    }
    const existing = latestOnceByKey.get(row.key)
    if (!existing || row.decidedAt > existing.decidedAt) {
      latestOnceByKey.set(row.key, row)
    }
  }

  for (const row of latestOnceByKey.values()) {
    rows.push(
      toDisplayRow({
        rowId: row.id,
        registryKey: row.key,
        request: row.request,
        decision: row.decision,
        scope: 'once',
        tabId: row.tabId > 0 ? row.tabId : undefined,
        updatedAt: row.decidedAt,
        revocable: false,
        editable: true,
      })
    )
  }

  rows.sort(comparePermissionDisplayRows)
  return rows
}
