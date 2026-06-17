import {
  buildScriptPermissionRegistryKey,
  createEmptyScriptPermissionRegistry,
  parseScriptPermissionRegistryKey,
  type ScriptPermissionAdminPolicy,
  type ScriptPermissionDecision,
  type ScriptPermissionRegistry,
  type ScriptPermissionRegistryEntry,
  type ScriptPermissionRequest,
} from '@shared/script-permission'

export const SCRIPT_PERMISSION_REGISTRY_KEY = 'vws_script_permission_registry'

export async function readScriptPermissionRegistry(): Promise<ScriptPermissionRegistry> {
  const result = await chrome.storage.local.get(SCRIPT_PERMISSION_REGISTRY_KEY)
  const raw = result[SCRIPT_PERMISSION_REGISTRY_KEY]
  if (!raw || typeof raw !== 'object') {
    return createEmptyScriptPermissionRegistry()
  }
  const entries = (raw as ScriptPermissionRegistry).entries
  if (!entries || typeof entries !== 'object') {
    return createEmptyScriptPermissionRegistry()
  }
  return { version: 1, entries: { ...entries } }
}

export async function writeScriptPermissionRegistry(registry: ScriptPermissionRegistry): Promise<void> {
  await chrome.storage.local.set({ [SCRIPT_PERMISSION_REGISTRY_KEY]: registry })
}

export function upsertPersistentPermissionEntry(
  registry: ScriptPermissionRegistry,
  request: ScriptPermissionRequest,
  decision: ScriptPermissionDecision,
  contentHash?: string,
  adminPolicy?: ScriptPermissionAdminPolicy
): ScriptPermissionRegistry {
  const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
  const entry: ScriptPermissionRegistryEntry = {
    decision,
    remember: 'persistent',
    updatedAt: Date.now(),
    ...(adminPolicy ? { adminPolicy } : {}),
    ...(contentHash ? { contentHash } : {}),
  }
  return {
    version: 1,
    entries: {
      ...registry.entries,
      [key]: entry,
    },
  }
}

export function removePersistentPermissionEntry(registry: ScriptPermissionRegistry, request: ScriptPermissionRequest): ScriptPermissionRegistry {
  const key = buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)
  const nextEntries = { ...registry.entries }
  delete nextEntries[key]
  return { version: 1, entries: nextEntries }
}

export function removePersistentPermissionEntryByKey(registry: ScriptPermissionRegistry, key: string): ScriptPermissionRegistry {
  const nextEntries = { ...registry.entries }
  delete nextEntries[key]
  return { version: 1, entries: nextEntries }
}

export interface ScriptPermissionRegistryRow {
  key: string
  request: ScriptPermissionRequest
  entry: ScriptPermissionRegistryEntry
}

/** List persistent registry rows with parsed request metadata. */
export function listScriptPermissionRegistryRows(registry: ScriptPermissionRegistry): ScriptPermissionRegistryRow[] {
  const rows: ScriptPermissionRegistryRow[] = []
  for (const [key, entry] of Object.entries(registry.entries)) {
    const request = parseScriptPermissionRegistryKey(key)
    if (!request) {
      continue
    }
    rows.push({ key, request, entry })
  }
  rows.sort((a, b) => b.entry.updatedAt - a.entry.updatedAt)
  return rows
}
