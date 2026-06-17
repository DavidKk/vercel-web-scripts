/** Session-scoped script permissions (This tab). Survives MV3 service worker restarts within a browser session. */
export const SCRIPT_PERMISSION_SESSION_KEY = 'vws_script_permission_session'

export type ScriptPermissionSessionSnapshot = {
  version: 1
  allow: Record<string, string[]>
  deny: Record<string, string[]>
}

export function createEmptyScriptPermissionSessionSnapshot(): ScriptPermissionSessionSnapshot {
  return { version: 1, allow: {}, deny: {} }
}

export function snapshotFromSessionPermissionMaps(
  allowByTab: ReadonlyMap<number, ReadonlySet<string>>,
  denyByTab: ReadonlyMap<number, ReadonlySet<string>>
): ScriptPermissionSessionSnapshot {
  const allow: Record<string, string[]> = {}
  const deny: Record<string, string[]> = {}
  for (const [tabId, keys] of allowByTab) {
    if (keys.size > 0) {
      allow[String(tabId)] = [...keys]
    }
  }
  for (const [tabId, keys] of denyByTab) {
    if (keys.size > 0) {
      deny[String(tabId)] = [...keys]
    }
  }
  return { version: 1, allow, deny }
}

export function applyScriptPermissionSessionSnapshot(snapshot: ScriptPermissionSessionSnapshot, allowByTab: Map<number, Set<string>>, denyByTab: Map<number, Set<string>>): void {
  allowByTab.clear()
  denyByTab.clear()
  for (const [tabIdRaw, keys] of Object.entries(snapshot.allow ?? {})) {
    const tabId = Number(tabIdRaw)
    if (!Number.isFinite(tabId) || !Array.isArray(keys)) {
      continue
    }
    const normalized = keys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    if (normalized.length > 0) {
      allowByTab.set(tabId, new Set(normalized))
    }
  }
  for (const [tabIdRaw, keys] of Object.entries(snapshot.deny ?? {})) {
    const tabId = Number(tabIdRaw)
    if (!Number.isFinite(tabId) || !Array.isArray(keys)) {
      continue
    }
    const normalized = keys.filter((key): key is string => typeof key === 'string' && key.length > 0)
    if (normalized.length > 0) {
      denyByTab.set(tabId, new Set(normalized))
    }
  }
}

export async function readScriptPermissionSessionSnapshot(): Promise<ScriptPermissionSessionSnapshot> {
  try {
    const result = await chrome.storage.session.get(SCRIPT_PERMISSION_SESSION_KEY)
    const raw = result[SCRIPT_PERMISSION_SESSION_KEY]
    if (!raw || typeof raw !== 'object') {
      return createEmptyScriptPermissionSessionSnapshot()
    }
    const snapshot = raw as ScriptPermissionSessionSnapshot
    return {
      version: 1,
      allow: snapshot.allow && typeof snapshot.allow === 'object' ? { ...snapshot.allow } : {},
      deny: snapshot.deny && typeof snapshot.deny === 'object' ? { ...snapshot.deny } : {},
    }
  } catch {
    return createEmptyScriptPermissionSessionSnapshot()
  }
}

export async function writeScriptPermissionSessionSnapshot(snapshot: ScriptPermissionSessionSnapshot): Promise<void> {
  try {
    await chrome.storage.session.set({ [SCRIPT_PERMISSION_SESSION_KEY]: snapshot })
  } catch {
    // session storage may be unavailable in older Chromium builds
  }
}
