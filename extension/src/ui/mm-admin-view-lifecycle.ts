import { invalidateExtensionServicesStateCache } from '@ext/shared/extension-storage'

import { type AdminRoute, type AdminTab, parseAdminHash } from './mm-admin-hash'

type AdminViewActivatedDetail = {
  tab: AdminTab
  route: AdminRoute
}

/**
 * Notify panel apps to reload data for the active admin route.
 * @param route Optional route; defaults to current location hash
 */
export function emitAdminViewActivated(route?: AdminRoute): void {
  const resolved = route ?? parseAdminHash(location.hash || '#servers')
  document.dispatchEvent(new CustomEvent('mm-admin-view-activated', { detail: { tab: resolved.tab, route: resolved } satisfies AdminViewActivatedDetail }))
}

/**
 * Reload the active panel when the admin tab regains focus (e.g. after web Connect).
 */
export function initAdminPageFocusRefresh(): void {
  let wasHidden = document.visibilityState === 'hidden'

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true
      return
    }
    if (!wasHidden) {
      return
    }
    wasHidden = false
    invalidateExtensionServicesStateCache()
    emitAdminViewActivated()
  })
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
