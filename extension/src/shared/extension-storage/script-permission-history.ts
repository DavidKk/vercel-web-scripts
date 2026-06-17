import type { ScriptPermissionDecision, ScriptPermissionRemember, ScriptPermissionRequest } from '@shared/script-permission'

export const SCRIPT_PERMISSION_HISTORY_KEY = 'vws_script_permission_history'
export const MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES = 500

export interface ScriptPermissionHistoryEntry {
  id: string
  tabId: number
  key: string
  request: ScriptPermissionRequest
  decision: ScriptPermissionDecision
  remember: ScriptPermissionRemember
  decidedAt: number
}

export interface ScriptPermissionHistory {
  version: 1
  entries: ScriptPermissionHistoryEntry[]
}

function createEmptyPermissionHistory(): ScriptPermissionHistory {
  return { version: 1, entries: [] }
}

export async function readScriptPermissionHistory(): Promise<ScriptPermissionHistory> {
  const result = await chrome.storage.local.get(SCRIPT_PERMISSION_HISTORY_KEY)
  const raw = result[SCRIPT_PERMISSION_HISTORY_KEY]
  if (!raw || typeof raw !== 'object') {
    return createEmptyPermissionHistory()
  }
  const entries = (raw as ScriptPermissionHistory).entries
  if (!Array.isArray(entries)) {
    return createEmptyPermissionHistory()
  }
  return { version: 1, entries: [...entries] }
}

export async function writeScriptPermissionHistory(history: ScriptPermissionHistory): Promise<void> {
  await chrome.storage.local.set({ [SCRIPT_PERMISSION_HISTORY_KEY]: history })
}

/** Append newest-first audit rows; trims to {@link MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES}. */
export async function appendScriptPermissionHistoryEntries(entries: readonly ScriptPermissionHistoryEntry[]): Promise<void> {
  if (entries.length === 0) {
    return
  }
  const history = await readScriptPermissionHistory()
  const merged = [...entries, ...history.entries]
  while (merged.length > MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES) {
    merged.pop()
  }
  await writeScriptPermissionHistory({ version: 1, entries: merged })
}

/** List all audit rows newest-first (every modal capture and admin override). */
export function listPermissionHistoryRows(history: ScriptPermissionHistory): ScriptPermissionHistoryEntry[] {
  return [...history.entries].sort((a, b) => b.decidedAt - a.decidedAt)
}

/** @deprecated Prefer {@link listPermissionHistoryRows}; kept for tests. */
export function listOncePermissionHistoryRows(history: ScriptPermissionHistory): ScriptPermissionHistoryEntry[] {
  return history.entries.filter((entry) => entry.remember === 'once').sort((a, b) => b.decidedAt - a.decidedAt)
}
