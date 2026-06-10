/** Whether preset/scripts should run on a tab given master-switch state. */
export function isShellEnabledForTabState(globalEnabled: boolean, disabledTabIds: readonly number[], tabId: number): boolean {
  if (!globalEnabled) {
    return false
  }
  return !disabledTabIds.includes(tabId)
}
