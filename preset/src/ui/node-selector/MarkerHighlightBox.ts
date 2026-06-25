import { MarkerLabel } from './MarkerLabel'

/**
 * Marker highlight box custom element
 * Automatically tracks and follows a target node's position and size
 */
export class MarkerHighlightBox extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-marker-highlight-box'

  /** Target node reference */
  #targetNode: HTMLElement | null = null
  /** Resize observer */
  #resizeObserver: ResizeObserver | null = null
  /** Intersection observer */
  #intersectionObserver: IntersectionObserver | null = null
  /** Scroll handler */
  #scrollHandler: (() => void) | null = null
  /** Resize handler */
  #resizeHandler: (() => void) | null = null
  /** Update position RAF */
  #rafId: number | null = null
  /** Pending position update flag (to avoid duplicate RAF calls) */
  #pendingUpdate = false
  /** Scrollable parent elements for cleanup */
  #scrollableParents: HTMLElement[] = []
  /** Marker floating bar host */
  #markerLabel: MarkerLabel | null = null
  /** Delete callback */
  #deleteCallback: (() => void) | null = null
  /** Whether highlight box has been positioned at least once (to avoid 0,0 flash on init) */
  #hasPositionedOnce = false

  /**
   * Get scrollbar width (cached to avoid repeated calculations)
   */
  #getScrollbarWidth(): number {
    const outer = document.createElement('div')
    outer.style.visibility = 'hidden'
    outer.style.overflow = 'scroll'
    // @ts-ignore - msOverflowStyle is IE-specific
    outer.style.msOverflowStyle = 'scrollbar'
    document.body.appendChild(outer)

    const inner = document.createElement('div')
    outer.appendChild(inner)

    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth

    outer.parentNode?.removeChild(outer)
    return scrollbarWidth
  }

  /** Cached scrollbar width (lazy initialized) */
  #scrollbarWidth: number | null = null

  #getCachedScrollbarWidth(): number {
    if (this.#scrollbarWidth === null) {
      this.#scrollbarWidth = this.#getScrollbarWidth()
    }
    return this.#scrollbarWidth
  }

  #hasFixedOrStickyPosition(element: HTMLElement): boolean {
    const elementStyle = window.getComputedStyle(element)
    if (elementStyle.position === 'fixed' || elementStyle.position === 'sticky') {
      return true
    }

    let current: HTMLElement | null = element.parentElement
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current)
      if (style.position === 'fixed' || style.position === 'sticky') {
        return true
      }
      current = current.parentElement
    }
    return false
  }

  #doUpdatePosition() {
    if (!this.#targetNode) {
      this.classList.add('node-selector-marker-highlight--hidden')
      return
    }

    const rect = this.#targetNode.getBoundingClientRect()
    const isFixedOrSticky = this.#hasFixedOrStickyPosition(this.#targetNode)
    const scrollbarWidth = this.#getCachedScrollbarWidth()

    const viewportWidth = window.innerWidth - scrollbarWidth
    const viewportHeight = window.innerHeight

    let top = rect.top
    let left = rect.left
    let width = rect.width
    let height = rect.height

    const rightEdge = left + width
    const bottomRightY = top + height

    if (rightEdge > viewportWidth) {
      width = Math.max(0, viewportWidth - left)
    }

    if (bottomRightY > viewportHeight) {
      height = Math.max(0, viewportHeight - top)
    }

    if (isFixedOrSticky) {
      this.style.position = 'fixed'
      this.style.top = `${top}px`
      this.style.left = `${left}px`
    } else {
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      this.style.position = 'absolute'
      this.style.top = `${top + scrollY}px`
      this.style.left = `${left + scrollX}px`
    }

    this.style.width = `${width}px`
    this.style.height = `${height}px`
    if (!this.#hasPositionedOnce) {
      this.classList.remove('node-selector-marker-highlight--hidden')
      this.#hasPositionedOnce = true
    }
    this.#pendingUpdate = false
  }

  #updatePosition() {
    if (this.#pendingUpdate) return
    this.#pendingUpdate = true

    if (this.#rafId === null) {
      this.#rafId = requestAnimationFrame(() => {
        this.#rafId = null
        this.#doUpdatePosition()
      })
    }
  }

  updatePosition(): void {
    this.#updatePosition()
  }

  #handleScroll = () => {
    this.#updatePosition()
  }

  #handleResize = () => {
    this.#updatePosition()
  }

  /**
   * Initialize tracking for target node
   * @param selector CSS selector, XPath, or HTMLElement reference
   */
  initialize(selector: string | HTMLElement) {
    this.#cleanupObservers()

    if (selector instanceof HTMLElement) {
      this.#targetNode = selector
    } else {
      if (selector.startsWith('/') || selector.startsWith('//')) {
        try {
          const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          this.#targetNode = result.singleNodeValue as HTMLElement | null
        } catch {
          this.#targetNode = null
        }
      } else {
        this.#targetNode = document.querySelector(selector) as HTMLElement
      }
    }

    if (!this.#targetNode) {
      this.classList.add('node-selector-marker-highlight--hidden')
      this.#hasPositionedOnce = false
      return
    }

    this.#hasPositionedOnce = false
    this.classList.add('node-selector-marker-highlight--hidden')

    this.#updatePosition()

    this.#resizeObserver = new ResizeObserver(() => {
      this.#updatePosition()
    })
    this.#resizeObserver.observe(this.#targetNode)

    this.#intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        this.classList.remove('node-selector-marker-highlight--hidden')
      } else {
        this.classList.add('node-selector-marker-highlight--hidden')
      }
    })
    this.#intersectionObserver.observe(this.#targetNode)

    this.#scrollHandler = this.#handleScroll
    this.#resizeHandler = this.#handleResize

    window.addEventListener('resize', this.#resizeHandler)
    window.addEventListener('scroll', this.#scrollHandler, true)

    let parent: HTMLElement | null = this.#targetNode.parentElement
    const scrollableParents: HTMLElement[] = []

    while (parent && parent !== document.body && parent !== document.documentElement) {
      const style = window.getComputedStyle(parent)
      const isScrollable =
        (style.overflow === 'auto' ||
          style.overflow === 'scroll' ||
          style.overflowY === 'auto' ||
          style.overflowY === 'scroll' ||
          style.overflowX === 'auto' ||
          style.overflowX === 'scroll') &&
        (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth)

      if (isScrollable) {
        scrollableParents.push(parent)
        parent.addEventListener('scroll', this.#scrollHandler, true)
      }
      parent = parent.parentElement
    }

    this.#scrollableParents = scrollableParents
  }

  /**
   * Set marker controls (caller + close)
   * @param caller Caller script name
   * @param onDelete Delete callback
   */
  setMarkerControls(caller: string, onDelete: () => void) {
    this.#deleteCallback = onDelete

    if (this.#markerLabel) {
      this.#markerLabel.cleanup()
      this.#markerLabel.remove()
      this.#markerLabel = null
    }

    const marker = document.createElement(MarkerLabel.TAG_NAME) as MarkerLabel
    marker.initialize(caller, onDelete, () => this.#getCachedScrollbarWidth())
    this.appendChild(marker)
    this.#markerLabel = marker

    if (this.#targetNode) {
      marker.bindTarget(this.#targetNode)
    }
  }

  setMarkerColor(color: string) {
    this.style.setProperty('--marker-color', color)
  }

  #cleanupObservers() {
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }

    if (this.#intersectionObserver) {
      this.#intersectionObserver.disconnect()
      this.#intersectionObserver = null
    }

    if (this.#scrollHandler || this.#resizeHandler) {
      if (this.#scrollHandler) {
        window.removeEventListener('scroll', this.#scrollHandler, true)
      }
      if (this.#resizeHandler) {
        window.removeEventListener('resize', this.#resizeHandler)
      }

      this.#scrollableParents.forEach((parent) => {
        if (this.#scrollHandler) {
          parent.removeEventListener('scroll', this.#scrollHandler, true)
        }
      })
      this.#scrollableParents = []

      this.#scrollHandler = null
      this.#resizeHandler = null
    }

    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId)
      this.#rafId = null
    }

    this.#pendingUpdate = false
    this.#targetNode = null
  }

  cleanup() {
    this.#cleanupObservers()

    if (this.#markerLabel) {
      this.#markerLabel.cleanup()
      this.#markerLabel.remove()
      this.#markerLabel = null
    }

    this.#deleteCallback = null
  }

  connectedCallback() {
    const selector = this.getAttribute('data-target-selector')
    if (selector) {
      this.initialize(selector)
    }
  }

  disconnectedCallback() {
    this.cleanup()
  }
}

if (typeof customElements !== 'undefined' && customElements != null && !customElements.get(MarkerHighlightBox.TAG_NAME)) {
  customElements.define(MarkerHighlightBox.TAG_NAME, MarkerHighlightBox)
}
