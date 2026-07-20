import { bindScrollIndicator, refreshScrollIndicator } from '@ext/ui/mm-form-components/scroll-indicator'

/**
 * Build a non-draggable mm scroll-indicator shell (2px track via CSS).
 * @param scrollerClass Extra class on the scroller (e.g. chat-log body)
 * @param scrollerTag Element tag for the overflow region
 */
export function createMmScrollIndicatorShell(scrollerClass: string, scrollerTag: 'div' | 'pre' = 'div'): { shell: HTMLElement; scroller: HTMLElement; refresh: () => void } {
  const shell = document.createElement('div')
  shell.className = 'mm-scroll-indicator-shell'

  const scroller = document.createElement(scrollerTag)
  scroller.className = `mm-scroll-indicator-scroller ${scrollerClass}`.trim()

  const track = document.createElement('div')
  track.className = 'mm-scroll-indicator-track'
  track.setAttribute('aria-hidden', 'true')
  const thumb = document.createElement('span')
  thumb.className = 'mm-scroll-indicator-thumb'
  track.appendChild(thumb)

  shell.append(scroller, track)
  const refresh = bindScrollIndicator(scroller)
  return { shell, scroller, refresh }
}

/**
 * Ensure `data-ref` scroll shell in the template is bound.
 * @param host Element that contains shell markup
 * @param scrollerRef data-ref on the scroller
 */
export function bindMmScrollIndicatorByRef(host: ParentNode, scrollerRef: string): (() => void) | null {
  const scroller = host.querySelector(`[data-ref="${scrollerRef}"]`) as HTMLElement | null
  if (!scroller) {
    return null
  }
  return bindScrollIndicator(scroller)
}

export { refreshScrollIndicator }
