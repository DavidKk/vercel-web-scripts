type Dispose = () => void

const INDICATOR_CLASS = 'mm-admin-nav-indicator'
const BOUND_ATTR = 'data-mm-nav-indicator-bound'
const READY_CLASS = 'is-indicator-ready'
const ENTERING_CLASS = 'is-indicator-entering'

const ENTRANCE_DELAY_MS = 140

let entrancePlayed = false

type IndicatorGeometry = {
  x: number
  w: number
  cx: number
}

function getCurrentLink(nav: HTMLElement): HTMLElement | null {
  return nav.querySelector('.mm-admin-nav-link[aria-current="page"]')
}

function measureTarget(nav: HTMLElement, target: HTMLElement): IndicatorGeometry {
  const navRect = nav.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const x = Math.round(targetRect.left - navRect.left)
  const w = Math.round(targetRect.width)
  return { x, w, cx: Math.round(x + w / 2) }
}

function applyIndicatorGeometry(nav: HTMLElement, geom: Pick<IndicatorGeometry, 'x' | 'w'>, opacity: number): void {
  nav.style.setProperty('--mm-nav-indicator-x', `${geom.x}px`)
  nav.style.setProperty('--mm-nav-indicator-w', `${geom.w}px`)
  nav.style.setProperty('--mm-nav-indicator-opacity', `${opacity}`)
}

function setIndicatorTarget(nav: HTMLElement, target: HTMLElement | null, opacity = 1): void {
  if (!target) {
    nav.style.setProperty('--mm-nav-indicator-opacity', '0')
    return
  }
  const { x, w } = measureTarget(nav, target)
  applyIndicatorGeometry(nav, { x, w }, opacity)
}

function findAdminNav(root: ParentNode): HTMLElement | null {
  return root instanceof HTMLElement && root.classList.contains('mm-admin-nav') ? root : (root.querySelector('.mm-admin-nav') as HTMLElement | null)
}

function isIndicatorInteractive(nav: HTMLElement): boolean {
  return nav.classList.contains(READY_CLASS)
}

/** Re-align the sliding tab indicator to the current page tab (after entrance). */
export function syncAdminNavIndicator(root: ParentNode = document): void {
  const nav = findAdminNav(root)
  if (!nav || !isIndicatorInteractive(nav)) {
    return
  }
  setIndicatorTarget(nav, getCurrentLink(nav))
}

/**
 * First-paint entrance: hidden briefly, then expand from the active tab center with spring easing.
 * Targets the tab with `aria-current`, never the first link by default.
 */
export function playAdminNavIndicatorEntrance(root: ParentNode = document): void {
  if (entrancePlayed) {
    syncAdminNavIndicator(root)
    return
  }

  const nav = findAdminNav(root)
  if (!nav) {
    return
  }

  const target = getCurrentLink(nav)
  if (!target) {
    window.requestAnimationFrame(() => playAdminNavIndicatorEntrance(root))
    return
  }

  const indicator = nav.querySelector(`.${INDICATOR_CLASS}`) as HTMLElement | null
  if (!indicator) {
    return
  }

  entrancePlayed = true
  const geom = measureTarget(nav, target)

  nav.classList.remove(READY_CLASS, ENTERING_CLASS)
  applyIndicatorGeometry(nav, { x: geom.cx, w: 0 }, 0)

  let finished = false
  const finishEnter = (event: TransitionEvent): void => {
    if (finished || event.target !== indicator || event.propertyName !== 'width') {
      return
    }
    finished = true
    indicator.removeEventListener('transitionend', finishEnter)
    nav.classList.remove(ENTERING_CLASS)
    nav.classList.add(READY_CLASS)
  }

  indicator.addEventListener('transitionend', finishEnter)

  window.setTimeout(() => {
    requestAnimationFrame(() => {
      nav.classList.add(ENTERING_CLASS)
      applyIndicatorGeometry(nav, { x: geom.x, w: geom.w }, 1)
    })
  }, ENTRANCE_DELAY_MS)
}

function bindIndicatorInteractions(nav: HTMLElement): void {
  const syncToCurrent = (): void => syncAdminNavIndicator(nav)

  nav.addEventListener('pointerover', (event) => {
    if (!isIndicatorInteractive(nav)) {
      return
    }
    const link = (event.target as HTMLElement).closest<HTMLElement>('.mm-admin-nav-link')
    if (!link || !nav.contains(link)) {
      return
    }
    setIndicatorTarget(nav, link)
  })
  nav.addEventListener('pointerleave', syncToCurrent)
  nav.addEventListener('focusin', (event) => {
    if (!isIndicatorInteractive(nav)) {
      return
    }
    const link = (event.target as HTMLElement).closest<HTMLElement>('.mm-admin-nav-link')
    if (link && nav.contains(link)) {
      setIndicatorTarget(nav, link)
    }
  })
  nav.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!nav.contains(document.activeElement)) {
        syncToCurrent()
      }
    })
  })

  window.addEventListener('resize', () => {
    if (entrancePlayed && isIndicatorInteractive(nav)) {
      syncToCurrent()
    }
  })
}

/**
 * Attach sliding hover/focus indicator to one admin nav bar.
 * Safe to call after tab links are rendered; binds once per nav element.
 */
export function bindAdminNavIndicator(nav: HTMLElement): void {
  if (nav.getAttribute(BOUND_ATTR) === 'true') {
    return
  }
  nav.setAttribute(BOUND_ATTR, 'true')

  if (!nav.querySelector(`.${INDICATOR_CLASS}`)) {
    const indicator = document.createElement('span')
    indicator.className = INDICATOR_CLASS
    indicator.setAttribute('aria-hidden', 'true')
    nav.insertBefore(indicator, nav.firstChild)
  }

  bindIndicatorInteractions(nav)
}

/**
 * Add moving hover/focus indicator for admin header tabs.
 * Only `.mm-admin-nav-link` participates; GitHub icon remains independent.
 */
export function initAdminNavIndicator(root: ParentNode): Dispose | undefined {
  const nav = findAdminNav(root)
  if (!nav) {
    return undefined
  }
  bindAdminNavIndicator(nav)
  return undefined
}
