/**
 * Non-interactive scroll position indicator (1px track) for small overflow regions.
 * Hides native scrollbars; wheel / touch scrolling still works on the scroller.
 */

export interface ScrollThumbMetrics {
  scrollable: boolean
  thumbHeight: number
  thumbTop: number
}

export const SCROLL_INDICATOR_CLASS_PREFIX = {
  mm: {
    shell: 'mm-scroll-indicator-shell',
    scroller: 'mm-scroll-indicator-scroller',
    track: 'mm-scroll-indicator-track',
    thumb: 'mm-scroll-indicator-thumb',
  },
  vws: {
    shell: 'vws-scroll-indicator-shell',
    scroller: 'vws-scroll-indicator-scroller',
    track: 'vws-scroll-indicator-track',
    thumb: 'vws-scroll-indicator-thumb',
  },
} as const

export type ScrollIndicatorPrefix = keyof typeof SCROLL_INDICATOR_CLASS_PREFIX

export interface ComputeScrollThumbMetricsOptions {
  minThumbHeight?: number
}

export interface BindScrollIndicatorOptions {
  classPrefix?: ScrollIndicatorPrefix
}

export interface EnsureMenuScrollIndicatorOptions {
  classPrefix?: ScrollIndicatorPrefix
  scrollerClassName?: string
}

type ScrollerWithRefresh = HTMLElement & {
  __mmScrollRefresh?: () => void
  __vwsScrollRefresh?: () => void
}

function getRefreshKey(prefix: ScrollIndicatorPrefix): '__mmScrollRefresh' | '__vwsScrollRefresh' {
  return prefix === 'mm' ? '__mmScrollRefresh' : '__vwsScrollRefresh'
}

/**
 * Compute scroll indicator thumb size and position from layout metrics.
 */
export function computeScrollThumbMetrics(
  params: { scrollHeight: number; clientHeight: number; scrollTop: number; trackHeight: number },
  options?: ComputeScrollThumbMetricsOptions
): ScrollThumbMetrics {
  const { scrollHeight, clientHeight, scrollTop, trackHeight } = params
  const minThumbHeight = options?.minThumbHeight ?? 12
  const scrollable = scrollHeight > clientHeight + 1
  if (!scrollable) {
    return { scrollable: false, thumbHeight: 0, thumbTop: 0 }
  }

  const thumbHeight = Math.max(minThumbHeight, Math.round((clientHeight / scrollHeight) * trackHeight))
  const maxTop = Math.max(0, trackHeight - thumbHeight)
  const scrollRange = scrollHeight - clientHeight
  const thumbTop = scrollRange > 0 ? Math.round((scrollTop / scrollRange) * maxTop) : 0
  return { scrollable: true, thumbHeight, thumbTop }
}

/**
 * Bind a scroll position indicator to a scrollable element inside a scroll-indicator shell.
 * @param scroller Overflow element (must sit beside the track in the shell)
 * @param options Class prefix for shell/track/thumb selectors (default `vws`)
 * @returns Function to refresh thumb position/size
 */
export function bindScrollIndicator(scroller: HTMLElement, options?: BindScrollIndicatorOptions): () => void {
  const classPrefix = options?.classPrefix ?? 'vws'
  const classes = SCROLL_INDICATOR_CLASS_PREFIX[classPrefix]
  const refreshKey = getRefreshKey(classPrefix)
  const cached = (scroller as ScrollerWithRefresh)[refreshKey]
  if (cached) {
    cached()
    return cached
  }

  const shell = scroller.closest(`.${classes.shell}`)
  const track = shell?.querySelector(`.${classes.track}`) as HTMLElement | null
  const thumb = shell?.querySelector(`.${classes.thumb}`) as HTMLElement | null

  const update = (): void => {
    if (!track || !thumb) {
      return
    }
    requestAnimationFrame(() => {
      const { scrollHeight, clientHeight, scrollTop } = scroller
      const trackHeight = track.clientHeight
      const { scrollable, thumbHeight, thumbTop } = computeScrollThumbMetrics({
        scrollHeight,
        clientHeight,
        scrollTop,
        trackHeight,
      })
      track.classList.toggle('hidden', !scrollable)
      if (!scrollable) {
        thumb.style.height = '0px'
        thumb.style.transform = 'translateY(0)'
        return
      }

      thumb.style.height = `${thumbHeight}px`
      thumb.style.transform = `translateY(${thumbTop}px)`
    })
  }

  scroller.addEventListener('scroll', update, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    if (shell) {
      observer.observe(shell)
    }
  }

  update()
  ;(scroller as ScrollerWithRefresh)[refreshKey] = update
  return update
}

/**
 * Refresh scroll indicator if already bound on this scroller.
 * @param scroller Bound overflow element
 */
export function refreshScrollIndicator(scroller: HTMLElement | null | undefined): void {
  if (!scroller) return
  const element = scroller as ScrollerWithRefresh
  element.__vwsScrollRefresh?.()
  element.__mmScrollRefresh?.()
}

/** Mark a large scroll region with styled native scrollbar (draggable thumb). */
export function applyDraggableScroll(scroller: HTMLElement | null | undefined): void {
  scroller?.classList.add('vws-scroll-draggable')
}

/**
 * Wrap menu/list children in a scroll shell with a position indicator when missing.
 * @param menu Host element that currently holds option nodes directly
 * @param options Class prefix and optional extra scroller classes
 * @returns Bound scroller and refresh callback, or null when already wrapped / empty
 */
export function ensureMenuScrollIndicator(menu: HTMLElement, options?: EnsureMenuScrollIndicatorOptions): { scroller: HTMLElement; refresh: () => void } | null {
  const classPrefix = options?.classPrefix ?? 'mm'
  const classes = SCROLL_INDICATOR_CLASS_PREFIX[classPrefix]
  const scrollerClassName = options?.scrollerClassName ?? 'mm-select-menu-scroll'

  if (menu.querySelector(`.${classes.shell}`)) {
    const scroller = menu.querySelector(`.${classes.scroller}`) as HTMLElement | null
    return scroller ? { scroller, refresh: bindScrollIndicator(scroller, { classPrefix }) } : null
  }

  const shell = document.createElement('div')
  shell.className = classes.shell
  const scroller = document.createElement('div')
  scroller.className = `${classes.scroller} ${scrollerClassName}`
  scroller.setAttribute('role', 'presentation')

  while (menu.firstChild) {
    scroller.appendChild(menu.firstChild)
  }
  if (!scroller.childElementCount) {
    return null
  }

  const track = document.createElement('div')
  track.className = classes.track
  track.setAttribute('aria-hidden', 'true')
  const thumb = document.createElement('span')
  thumb.className = classes.thumb
  track.appendChild(thumb)

  shell.appendChild(scroller)
  shell.appendChild(track)
  menu.appendChild(shell)

  return { scroller, refresh: bindScrollIndicator(scroller, { classPrefix }) }
}
