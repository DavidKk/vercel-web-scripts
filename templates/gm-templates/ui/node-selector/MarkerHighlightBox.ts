/**
 * Marker highlight box custom element
 * Automatically tracks and follows a target node's position and size
 */
class MarkerHighlightBox extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-marker-highlight-box'

  /** Target node selector */
  #targetSelector: string | null = null
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
  /** Scrollable parent elements for cleanup */
  #scrollableParents: HTMLElement[] = []
  /** Marker label element */
  #markerLabel: HTMLElement | null = null
  /** Delete callback */
  #deleteCallback: (() => void) | null = null

  /**
   * Check if target element or any of its ancestors has position: fixed or sticky
   * Returns true if element itself or any ancestor has position: fixed or sticky
   * Uses the nearest fixed/sticky ancestor (or element itself if fixed/sticky)
   * @param element Element to check
   * @returns Whether element or any ancestor has position: fixed or sticky
   */
  #hasFixedOrStickyPosition(element: HTMLElement): boolean {
    // Check element itself first
    const elementStyle = window.getComputedStyle(element)
    if (elementStyle.position === 'fixed' || elementStyle.position === 'sticky') {
      return true
    }

    // Check all ancestors up to body
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

  /**
   * Update highlight box position and size
   * Dynamically uses fixed or absolute positioning based on target element's position
   * - If target or any ancestor has position: fixed or sticky, use fixed positioning
   * - Otherwise, use absolute positioning relative to document
   */
  #updatePosition() {
    if (!this.#targetNode) {
      this.classList.add('node-selector-marker-highlight--hidden')
      return
    }

    const rect = this.#targetNode.getBoundingClientRect()
    const isFixedOrSticky = this.#hasFixedOrStickyPosition(this.#targetNode)

    if (isFixedOrSticky) {
      // For fixed or sticky elements, use fixed positioning (relative to viewport)
      // Sticky elements behave like fixed when they're "stuck", so use fixed positioning
      // No need to add scroll offsets
      this.style.position = 'fixed'
      this.style.top = `${rect.top}px`
      this.style.left = `${rect.left}px`
    } else {
      // For non-fixed/sticky elements, use absolute positioning (relative to document)
      // Add window scroll to get document-relative position
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      this.style.position = 'absolute'
      this.style.top = `${rect.top + scrollY}px`
      this.style.left = `${rect.left + scrollX}px`
    }

    this.style.width = `${rect.width}px`
    this.style.height = `${rect.height}px`
    this.classList.remove('node-selector-marker-highlight--hidden')
  }

  /**
   * Handle scroll event
   */
  #handleScroll = () => {
    if (this.#rafId === null) {
      this.#rafId = requestAnimationFrame(() => {
        this.#rafId = null
        this.#updatePosition()
      })
    }
  }

  /**
   * Handle window resize
   */
  #handleResize = () => {
    if (this.#rafId === null) {
      this.#rafId = requestAnimationFrame(() => {
        this.#rafId = null
        this.#updatePosition()
      })
    }
  }

  /**
   * Initialize tracking for target node
   * @param selector CSS selector or HTMLElement reference
   */
  initialize(selector: string | HTMLElement) {
    // Clean up observers and event listeners, but keep marker label
    // Note: #cleanupObservers() only cleans up observers/listeners, it doesn't remove the marker label
    this.#cleanupObservers()

    if (selector instanceof HTMLElement) {
      this.#targetNode = selector
      this.#targetSelector = null
    } else {
      this.#targetSelector = selector
      this.#targetNode = document.querySelector(selector) as HTMLElement
    }

    if (!this.#targetNode) {
      this.classList.add('node-selector-marker-highlight--hidden')
      return
    }

    // Initial position update
    this.#updatePosition()

    // Create ResizeObserver to track size changes
    this.#resizeObserver = new ResizeObserver(() => {
      this.#updatePosition()
    })
    this.#resizeObserver.observe(this.#targetNode)

    // Create IntersectionObserver to hide when out of viewport
    this.#intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry.isIntersecting) {
        this.classList.remove('node-selector-marker-highlight--hidden')
      } else {
        this.classList.add('node-selector-marker-highlight--hidden')
      }
    })
    this.#intersectionObserver.observe(this.#targetNode)

    // Set up scroll and resize handlers
    this.#scrollHandler = this.#handleScroll
    this.#resizeHandler = this.#handleResize

    // Always listen to window resize and scroll (needed for position updates)
    window.addEventListener('resize', this.#resizeHandler)
    window.addEventListener('scroll', this.#scrollHandler, true)

    // Find and listen to all scrollable parent containers
    // This is necessary because elements inside scrollable containers need position updates
    // when their parent containers scroll
    let parent: HTMLElement | null = this.#targetNode.parentElement
    const scrollableParents: HTMLElement[] = []

    // Traverse up the DOM tree to find all scrollable parents
    // No depth limit - we need to find all scrollable containers
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

    // Store scrollable parents for cleanup
    this.#scrollableParents = scrollableParents
  }

  /**
   * Set marker label and delete callback
   * @param label Label text
   * @param onDelete Delete callback
   */
  setMarkerLabel(label: string, onDelete: () => void) {
    this.#deleteCallback = onDelete

    // Remove existing label if any
    if (this.#markerLabel) {
      this.#markerLabel.remove()
    }

    // Create marker label element
    const marker = document.createElement('div')
    marker.className = 'node-selector-marker'
    marker.setAttribute('data-node-selector-marker', '')

    const dot = document.createElement('div')
    dot.className = 'node-selector-marker__dot'

    const labelEl = document.createElement('div')
    labelEl.className = 'node-selector-marker__label'
    labelEl.textContent = label

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'node-selector-marker__delete'
    deleteBtn.setAttribute('title', '删除标记')
    deleteBtn.setAttribute('aria-label', '删除标记')
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this.#deleteCallback) {
        this.#deleteCallback()
      }
    })

    marker.appendChild(dot)
    marker.appendChild(labelEl)
    marker.appendChild(deleteBtn)

    this.appendChild(marker)
    this.#markerLabel = marker
  }

  /**
   * Clean up observers and event listeners (but preserve marker label)
   */
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

      // Remove from stored scrollable parents
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

    this.#targetNode = null
  }

  /**
   * Clean up observers, event listeners, and marker label
   */
  cleanup() {
    this.#cleanupObservers()

    // Remove marker label only in full cleanup
    if (this.#markerLabel) {
      this.#markerLabel.remove()
      this.#markerLabel = null
    }

    this.#deleteCallback = null
  }

  /**
   * Called when element is inserted into DOM
   */
  connectedCallback() {
    // Get selector from attribute if available
    const selector = this.getAttribute('data-target-selector')
    if (selector) {
      this.initialize(selector)
    }
  }

  /**
   * Called when element is removed from DOM
   */
  disconnectedCallback() {
    this.cleanup()
  }
}

// Register marker highlight box custom element
if (!customElements.get(MarkerHighlightBox.TAG_NAME)) {
  customElements.define(MarkerHighlightBox.TAG_NAME, MarkerHighlightBox)
}
