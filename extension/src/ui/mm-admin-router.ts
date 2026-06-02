import { type AdminRoute, type AdminTab, adminTabTitle, buildAdminHash, parseAdminHash } from './mm-admin-hash'
import { playAdminNavIndicatorEntrance, syncAdminNavIndicator } from './mm-admin-nav'
import type { MmOptionsApp } from './mm-options-app'

const VIEW_ATTR = 'data-admin-view'

let activeTab: AdminTab = 'servers'
let indicatorEntrancePlayed = false

function getOptionsApp(): MmOptionsApp | null {
  return document.querySelector('mm-options-app') as MmOptionsApp | null
}

function setActiveView(route: AdminRoute): void {
  activeTab = route.tab
  const views = document.querySelectorAll<HTMLElement>(`[${VIEW_ATTR}]`)
  for (const view of views) {
    const tab = view.getAttribute(VIEW_ATTR) as AdminTab
    const isActive = tab === route.tab
    view.hidden = !isActive
    view.classList.toggle('is-active', isActive)
    view.setAttribute('aria-hidden', isActive ? 'false' : 'true')
  }

  document.querySelector('mm-admin-tabs')?.setAttribute('current', route.tab)
  if (!indicatorEntrancePlayed) {
    indicatorEntrancePlayed = true
    playAdminNavIndicatorEntrance(document)
  } else {
    syncAdminNavIndicator(document)
  }
  document.title = `MagickMonkey — ${adminTabTitle(route.tab)}`
  document.dispatchEvent(new CustomEvent('mm-admin-view-activated', { detail: { tab: route.tab, route } }))
}

async function canLeaveServersView(): Promise<boolean> {
  const app = getOptionsApp()
  if (!app) {
    return true
  }
  return app.confirmDiscardDetailChanges()
}

async function applyHash(hash: string): Promise<void> {
  const route = parseAdminHash(hash)
  if (route.tab !== activeTab && activeTab === 'servers') {
    const allowed = await canLeaveServersView()
    if (!allowed) {
      history.replaceState(null, '', buildAdminHash({ tab: activeTab }))
      return
    }
  }
  setActiveView(route)
}

function onTabClick(event: Event): void {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('.mm-admin-nav-link[data-admin-tab]')
  if (!link) {
    return
  }
  event.preventDefault()
  const tab = link.dataset.adminTab as AdminTab | undefined
  if (!tab) {
    return
  }
  const nextHash = buildAdminHash({ tab })
  if (location.hash === nextHash || (!location.hash && tab === 'servers')) {
    return
  }
  void (async () => {
    if (activeTab === 'servers' && tab !== 'servers') {
      const allowed = await canLeaveServersView()
      if (!allowed) {
        return
      }
    }
    location.hash = nextHash.slice(1)
  })()
}

/** Boot CSR tab router for unified admin.html. */
export function initAdminRouter(): void {
  document.querySelector('.mm-admin-nav')?.addEventListener('click', onTabClick)
  window.addEventListener('hashchange', () => {
    void applyHash(location.hash)
  })

  if (!location.hash) {
    history.replaceState(null, '', buildAdminHash({ tab: 'servers' }))
  }
  void applyHash(location.hash || buildAdminHash({ tab: 'servers' }))
}
