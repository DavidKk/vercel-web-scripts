import { SHELL_DISABLED_TAB_IDS_STORAGE_KEY, SHELL_MASTER_ENABLED_STORAGE_KEY } from './constants'
import { isShellEnabledForTabState } from './shell-master-switch-pure'

function normalizeDisabledTabIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
}

export async function getShellGloballyEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get(SHELL_MASTER_ENABLED_STORAGE_KEY)
  const value = result[SHELL_MASTER_ENABLED_STORAGE_KEY]
  return value !== false
}

export async function setShellGloballyEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [SHELL_MASTER_ENABLED_STORAGE_KEY]: enabled })
}

export async function getShellDisabledTabIds(): Promise<number[]> {
  const result = await chrome.storage.session.get(SHELL_DISABLED_TAB_IDS_STORAGE_KEY)
  return normalizeDisabledTabIds(result[SHELL_DISABLED_TAB_IDS_STORAGE_KEY])
}

async function saveShellDisabledTabIds(tabIds: number[]): Promise<void> {
  const unique = [...new Set(tabIds.filter((id) => id > 0))]
  if (unique.length === 0) {
    await chrome.storage.session.remove(SHELL_DISABLED_TAB_IDS_STORAGE_KEY)
    return
  }
  await chrome.storage.session.set({ [SHELL_DISABLED_TAB_IDS_STORAGE_KEY]: unique })
}

export async function isShellEnabledForTab(tabId: number): Promise<boolean> {
  const [globalEnabled, disabledTabIds] = await Promise.all([getShellGloballyEnabled(), getShellDisabledTabIds()])
  return isShellEnabledForTabState(globalEnabled, disabledTabIds, tabId)
}

export async function disableShellForTab(tabId: number): Promise<void> {
  const disabledTabIds = await getShellDisabledTabIds()
  if (disabledTabIds.includes(tabId)) {
    return
  }
  await saveShellDisabledTabIds([...disabledTabIds, tabId])
}

export async function disableShellGlobally(): Promise<void> {
  await setShellGloballyEnabled(false)
}

export async function clearShellDisabledTabIds(): Promise<void> {
  await saveShellDisabledTabIds([])
}

/**
 * Turn master switch on. When `clearAllTabDisables` is set, every tab-scoped disable is cleared
 * (used after a global off → on). Otherwise only `activeTabId` is removed from the disable list.
 */
export async function enableShellMaster(activeTabId?: number, options?: { clearAllTabDisables?: boolean }): Promise<void> {
  await setShellGloballyEnabled(true)
  if (options?.clearAllTabDisables) {
    await clearShellDisabledTabIds()
    return
  }
  if (activeTabId != null) {
    await removeShellDisabledTabId(activeTabId)
  }
}

/** @deprecated Use {@link enableShellMaster} */
export async function enableShellForTab(tabId?: number): Promise<void> {
  await enableShellMaster(tabId)
}

export async function removeShellDisabledTabId(tabId: number): Promise<void> {
  const disabledTabIds = await getShellDisabledTabIds()
  if (!disabledTabIds.includes(tabId)) {
    return
  }
  await saveShellDisabledTabIds(disabledTabIds.filter((id) => id !== tabId))
}
