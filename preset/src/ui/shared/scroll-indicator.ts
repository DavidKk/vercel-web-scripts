/**
 * Non-interactive scroll position indicator (1px track) for small overflow regions.
 * Hides native scrollbars; wheel / touch scrolling still works on the scroller.
 */

type ScrollerWithRefresh = HTMLElement & { __vwsScrollRefresh?: () => void }

export interface ScrollThumbMetrics {
  scrollable: boolean
  thumbHeight: number
  thumbTop: number
}

/**
 * Compute scroll indicator thumb size and position from layout metrics.
 */
export function computeScrollThumbMetrics(params: { scrollHeight: number; clientHeight: number; scrollTop: number; trackHeight: number }): ScrollThumbMetrics {
  const { scrollHeight, clientHeight, scrollTop, trackHeight } = params
  const scrollable = scrollHeight > clientHeight + 1
  if (!scrollable) {
    return { scrollable: false, thumbHeight: 0, thumbTop: 0 }
  }

  const thumbHeight = Math.max(12, Math.round((clientHeight / scrollHeight) * trackHeight))
  const maxTop = Math.max(0, trackHeight - thumbHeight)
  const scrollRange = scrollHeight - clientHeight
  const thumbTop = scrollRange > 0 ? Math.round((scrollTop / scrollRange) * maxTop) : 0
  return { scrollable: true, thumbHeight, thumbTop }
}

/**
 * Bind a scroll position indicator to a scrollable element inside `.vws-scroll-indicator-shell`.
 * @param scroller Overflow element (must sit beside `.vws-scroll-indicator-track` in the shell)
 * @returns Function to refresh thumb position/size
 */
export function bindScrollIndicator(scroller: HTMLElement): () => void {
  const cached = (scroller as ScrollerWithRefresh).__vwsScrollRefresh
  if (cached) {
    cached()
    return cached
  }

  const shell = scroller.closest('.vws-scroll-indicator-shell')
  const track = shell?.querySelector('.vws-scroll-indicator-track') as HTMLElement | null
  const thumb = shell?.querySelector('.vws-scroll-indicator-thumb') as HTMLElement | null

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
  ;(scroller as ScrollerWithRefresh).__vwsScrollRefresh = update
  return update
}

/**
 * Refresh scroll indicator if already bound on this scroller.
 * @param scroller Bound overflow element
 */
export function refreshScrollIndicator(scroller: HTMLElement | null | undefined): void {
  if (!scroller) return
  ;(scroller as ScrollerWithRefresh).__vwsScrollRefresh?.()
}

/** Mark a large scroll region with styled native scrollbar (draggable thumb). */
export function applyDraggableScroll(scroller: HTMLElement | null | undefined): void {
  scroller?.classList.add('vws-scroll-draggable')
}
