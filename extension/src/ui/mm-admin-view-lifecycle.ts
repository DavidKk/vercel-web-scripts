import type { AdminRoute, AdminTab } from './mm-admin-hash'

type AdminViewActivatedDetail = {
  tab: AdminTab
  route: AdminRoute
}

/**
 * Run a handler whenever the admin CSR router activates a tab panel.
 * @param tab Panel to listen for
 * @param handler Called with the parsed route when the panel becomes active
 * @returns Unsubscribe function
 */
export function subscribeAdminViewActivated(tab: AdminTab, handler: (route: AdminRoute) => void): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<AdminViewActivatedDetail>).detail
    if (detail?.tab !== tab) {
      return
    }
    handler(detail.route)
  }
  document.addEventListener('mm-admin-view-activated', listener)
  return () => document.removeEventListener('mm-admin-view-activated', listener)
}
