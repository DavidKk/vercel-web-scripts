type Dispose = () => void

const INDICATOR_CLASS = 'mm-admin-nav-indicator'

function getCurrentLink(nav: HTMLElement): HTMLElement | null {
  return nav.querySelector('.mm-admin-nav-link[aria-current="page"]')
}

function setIndicatorTarget(nav: HTMLElement, target: HTMLElement | null): void {
  if (!target) {
    nav.style.setProperty('--mm-nav-indicator-opacity', '0')
    return
  }
  const navRect = nav.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  nav.style.setProperty('--mm-nav-indicator-x', `${Math.round(targetRect.left - navRect.left)}px`)
  nav.style.setProperty('--mm-nav-indicator-w', `${Math.round(targetRect.width)}px`)
  nav.style.setProperty('--mm-nav-indicator-opacity', '1')
}

/**
 * Add moving hover/focus indicator for admin header tabs.
 * Only `.mm-admin-nav-link` participates; GitHub icon remains independent.
 */
export function initAdminNavIndicator(root: ParentNode): Dispose | undefined {
  const nav = root.querySelector('.mm-admin-nav') as HTMLElement | null
  if (!nav) return undefined
  const links = Array.from(nav.querySelectorAll<HTMLElement>('.mm-admin-nav-link'))
  if (links.length === 0) return undefined

  if (!nav.querySelector(`.${INDICATOR_CLASS}`)) {
    const indicator = document.createElement('span')
    indicator.className = INDICATOR_CLASS
    indicator.setAttribute('aria-hidden', 'true')
    nav.appendChild(indicator)
  }

  const syncToCurrent = (): void => {
    setIndicatorTarget(nav, getCurrentLink(nav) ?? links[0] ?? null)
  }

  const onNavLeave = (): void => syncToCurrent()
  const onNavFocusOut = (): void => {
    requestAnimationFrame(() => {
      if (!nav.contains(document.activeElement)) {
        syncToCurrent()
      }
    })
  }

  for (const link of links) {
    link.addEventListener('mouseenter', () => setIndicatorTarget(nav, link))
    link.addEventListener('focus', () => setIndicatorTarget(nav, link))
  }
  nav.addEventListener('mouseleave', onNavLeave)
  nav.addEventListener('focusout', onNavFocusOut)

  syncToCurrent()

  const onResize = (): void => syncToCurrent()
  window.addEventListener('resize', onResize)

  return () => {
    nav.removeEventListener('mouseleave', onNavLeave)
    nav.removeEventListener('focusout', onNavFocusOut)
    window.removeEventListener('resize', onResize)
  }
}
