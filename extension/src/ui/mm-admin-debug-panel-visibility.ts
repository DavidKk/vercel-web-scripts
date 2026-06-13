import { type AdminTab, parseAdminHash } from './mm-admin-hash'

type AdminViewActivatedDetail = {
  tab: AdminTab
}

/**
 * Show a floating debug panel only when the matching admin tab is active.
 */
export function bindDebugPanelToAdminTab(panel: HTMLElement, tab: AdminTab): () => void {
  const sync = (activeTab: AdminTab): void => {
    panel.classList.toggle('hidden', activeTab !== tab)
  }
  sync(parseAdminHash(location.hash || '#servers').tab)
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<AdminViewActivatedDetail>).detail
    if (!detail?.tab) {
      return
    }
    sync(detail.tab)
  }
  document.addEventListener('mm-admin-view-activated', listener)
  return () => document.removeEventListener('mm-admin-view-activated', listener)
}
