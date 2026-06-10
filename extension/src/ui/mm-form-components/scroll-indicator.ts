/**
 * Non-interactive scroll position indicator (1px track) for overflow lists.
 * Hides native scrollbars; wheel / touch scrolling still works on the scroller.
 */

/**
 * Bind a scroll position indicator to a scrollable element inside `.mm-scroll-indicator-shell`.
 * @param scroller Overflow element (must sit beside `.mm-scroll-indicator-track` in the shell)
 * @returns Function to refresh thumb position/size
 */
export function bindScrollIndicator(scroller: HTMLElement): () => void {
  const cached = (scroller as HTMLElement & { __mmScrollRefresh?: () => void }).__mmScrollRefresh
  if (cached) {
    cached()
    return cached
  }

  const shell = scroller.closest('.mm-scroll-indicator-shell')
  const track = shell?.querySelector('.mm-scroll-indicator-track') as HTMLElement | null
  const thumb = shell?.querySelector('.mm-scroll-indicator-thumb') as HTMLElement | null

  const update = (): void => {
    if (!track || !thumb) {
      return
    }
    requestAnimationFrame(() => {
      const { scrollHeight, clientHeight, scrollTop } = scroller
      const scrollable = scrollHeight > clientHeight + 1
      track.classList.toggle('hidden', !scrollable)
      if (!scrollable) {
        thumb.style.height = '0px'
        thumb.style.transform = 'translateY(0)'
        return
      }

      const trackHeight = track.clientHeight
      const thumbHeight = Math.max(12, Math.round((clientHeight / scrollHeight) * trackHeight))
      const maxTop = Math.max(0, trackHeight - thumbHeight)
      const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * maxTop)
      thumb.style.height = `${thumbHeight}px`
      thumb.style.transform = `translateY(${top}px)`
    })
  }

  scroller.addEventListener('scroll', update, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
  }

  update()
  ;(scroller as HTMLElement & { __mmScrollRefresh?: () => void }).__mmScrollRefresh = update
  return update
}

/**
 * Wrap menu/list children in a scroll shell with a position indicator when missing.
 * @param menu Host element that currently holds option nodes directly
 * @returns Bound scroller and refresh callback, or null when already wrapped / empty
 */
export function ensureMenuScrollIndicator(menu: HTMLElement): { scroller: HTMLElement; refresh: () => void } | null {
  if (menu.querySelector('.mm-scroll-indicator-shell')) {
    const scroller = menu.querySelector('.mm-scroll-indicator-scroller') as HTMLElement | null
    return scroller ? { scroller, refresh: bindScrollIndicator(scroller) } : null
  }

  const shell = document.createElement('div')
  shell.className = 'mm-scroll-indicator-shell'
  const scroller = document.createElement('div')
  scroller.className = 'mm-scroll-indicator-scroller mm-select-menu-scroll'
  scroller.setAttribute('role', 'presentation')

  while (menu.firstChild) {
    scroller.appendChild(menu.firstChild)
  }
  if (!scroller.childElementCount) {
    return null
  }

  const track = document.createElement('div')
  track.className = 'mm-scroll-indicator-track'
  track.setAttribute('aria-hidden', 'true')
  const thumb = document.createElement('span')
  thumb.className = 'mm-scroll-indicator-thumb'
  track.appendChild(thumb)

  shell.appendChild(scroller)
  shell.appendChild(track)
  menu.appendChild(shell)

  return { scroller, refresh: bindScrollIndicator(scroller) }
}
