import { computeScrollThumbMetrics } from '@shared/ui/scroll-indicator'

export interface MmScriptsScrollHost {
  scrollResizeObserver: ResizeObserver | undefined
  handleListScroll(): void
}

/** Bind scroll listener and resize observer for the custom scrollbar thumb. */
export function bindScrollIndicator(host: MmScriptsScrollHost, root: HTMLElement): void {
  const scroller = root.querySelector('[data-ref="scroller"]') as HTMLElement | null
  const content = root.querySelector('[data-ref="content"]') as HTMLElement | null
  if (!scroller) {
    return
  }
  scroller.addEventListener('scroll', host.handleListScroll, { passive: true })
  host.scrollResizeObserver = new ResizeObserver(() => updateScrollIndicator(root))
  host.scrollResizeObserver.observe(scroller)
  if (content) {
    host.scrollResizeObserver.observe(content)
  }
  updateScrollIndicator(root)
}

/** Sync custom scrollbar thumb size and position with list scroll metrics. */
export function updateScrollIndicator(root: HTMLElement): void {
  requestAnimationFrame(() => {
    const scroller = root.querySelector('[data-ref="scroller"]') as HTMLElement | null
    const scrollbar = root.querySelector('[data-ref="scrollbar"]') as HTMLElement | null
    const thumb = root.querySelector('[data-ref="scrollbar-thumb"]') as HTMLElement | null
    if (!scroller || !scrollbar || !thumb || scrollbar.offsetParent === null) {
      return
    }

    const { scrollable, thumbHeight, thumbTop } = computeScrollThumbMetrics(
      {
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        scrollTop: scroller.scrollTop,
        trackHeight: scrollbar.clientHeight,
      },
      { minThumbHeight: 18 }
    )
    scrollbar.classList.toggle('hidden', !scrollable)
    if (!scrollable) {
      thumb.style.height = '0px'
      thumb.style.transform = 'translateY(0)'
      return
    }

    thumb.style.height = `${thumbHeight}px`
    thumb.style.transform = `translateY(${thumbTop}px)`
  })
}
