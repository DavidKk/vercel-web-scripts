import { MarkerLabel } from './MarkerLabel'
import { MarkerXPathPanel } from './MarkerXPathPanel'

/**
 * Marker highlight box custom element
 * Automatically tracks and follows a target node's position and size
 */
export class MarkerHighlightBox extends HTMLElement {
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
  /** Pending position update flag (to avoid duplicate RAF calls) */
  #pendingUpdate = false
  /** Scrollable parent elements for cleanup */
  #scrollableParents: HTMLElement[] = []
  /** Marker label web component */
  #markerLabel: MarkerLabel | null = null
  /** XPath panel web component */
  #xpathPanel: MarkerXPathPanel | null = null
  /** Delete callback */
  #deleteCallback: (() => void) | null = null
  /** XPath value (deprecated, use xpaths instead) */
  #xpath: string | null = null
  /** XPaths array (all possible XPaths for this marked node) */
  #xpaths: string[] = []
  /** Hide panel timer */
  #hidePanelTimer: ReturnType<typeof setTimeout> | null = null
  /** ResizeObserver for marker label and panel */
  #markerResizeObserver: ResizeObserver | null = null
  /** Update marker position RAF */
  #markerRafId: number | null = null
  /** Pending marker position update flag */
  #pendingMarkerUpdate = false

  /**
   * Get scrollbar width (cached to avoid repeated calculations)
   */
  #getScrollbarWidth(): number {
    // Create a temporary div to measure scrollbar width
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

  /**
   * Cached scrollbar width (lazy initialized)
   */
  #scrollbarWidth: number | null = null

  /**
   * Get scrollbar width (with caching)
   */
  #getCachedScrollbarWidth(): number {
    if (this.#scrollbarWidth === null) {
      this.#scrollbarWidth = this.#getScrollbarWidth()
    }
    return this.#scrollbarWidth
  }

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
   * Update highlight box position and size (internal, called by RAF)
   * Dynamically uses fixed or absolute positioning based on target element's position
   * - If target or any ancestor has position: fixed or sticky, use fixed positioning
   * - Otherwise, use absolute positioning relative to document
   * Ensures top-right and bottom-right corners stay within viewport (accounting for scrollbar width)
   */
  #doUpdatePosition() {
    if (!this.#targetNode) {
      this.classList.add('node-selector-marker-highlight--hidden')
      return
    }

    const rect = this.#targetNode.getBoundingClientRect()
    const isFixedOrSticky = this.#hasFixedOrStickyPosition(this.#targetNode)
    const scrollbarWidth = this.#getCachedScrollbarWidth()

    // Viewport dimensions accounting for scrollbar
    const viewportWidth = window.innerWidth - scrollbarWidth
    const viewportHeight = window.innerHeight

    let top = rect.top
    let left = rect.left
    let width = rect.width
    let height = rect.height

    // Calculate right edge positions (top-right and bottom-right corners)
    const rightEdge = left + width
    const bottomRightY = top + height

    // Constrain: top-right and bottom-right corners must not exceed viewport right edge
    if (rightEdge > viewportWidth) {
      // Adjust width to keep right edge within viewport
      width = Math.max(0, viewportWidth - left)
    }

    // Also ensure bottom-right corner's Y doesn't exceed viewport bottom
    // (though this is less common, we check it for completeness)
    if (bottomRightY > viewportHeight) {
      // Adjust height to keep bottom-right corner within viewport
      height = Math.max(0, viewportHeight - top)
    }

    if (isFixedOrSticky) {
      // For fixed or sticky elements, use fixed positioning (relative to viewport)
      // Sticky elements behave like fixed when they're "stuck", so use fixed positioning
      // No need to add scroll offsets
      this.style.position = 'fixed'
      this.style.top = `${top}px`
      this.style.left = `${left}px`
    } else {
      // For non-fixed/sticky elements, use absolute positioning (relative to document)
      // Add window scroll to get document-relative position
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      this.style.position = 'absolute'
      this.style.top = `${top + scrollY}px`
      this.style.left = `${left + scrollX}px`
    }

    this.style.width = `${width}px`
    this.style.height = `${height}px`
    this.classList.remove('node-selector-marker-highlight--hidden')
    this.#pendingUpdate = false

    // Update marker label and panel position if they exist
    this.#updateMarkerPosition()
  }

  /**
   * Schedule position update (throttled via RAF to avoid jitter)
   */
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

  /**
   * Public method to trigger position update (for external observers)
   */
  updatePosition(): void {
    this.#updatePosition()
  }

  /**
   * Handle scroll event
   */
  #handleScroll = () => {
    this.#updatePosition()
  }

  /**
   * Handle window resize
   */
  #handleResize = () => {
    this.#updatePosition()
  }

  /**
   * Initialize tracking for target node
   * @param selector CSS selector, XPath, or HTMLElement reference
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
      // Check if it's an XPath (starts with / or //)
      if (selector.startsWith('/') || selector.startsWith('//')) {
        try {
          const result = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          this.#targetNode = result.singleNodeValue as HTMLElement | null
        } catch (e) {
          // XPath evaluation failed, fallback to null (will be hidden)
          this.#targetNode = null
        }
      } else {
        // CSS selector
        this.#targetNode = document.querySelector(selector) as HTMLElement
      }
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
   * @param xpaths XPaths array for the marked node (all possible XPaths)
   */
  setMarkerLabel(label: string, onDelete: () => void, xpaths: string[]) {
    this.#deleteCallback = onDelete
    this.#xpaths = xpaths || []
    // Keep backward compatibility
    this.#xpath = this.#xpaths.length > 0 ? this.#xpaths[0] : null

    // Remove existing marker label and panel if any
    if (this.#markerLabel) {
      this.#markerLabel.cleanup()
      this.#markerLabel.remove()
      this.#markerLabel = null
    }
    if (this.#xpathPanel) {
      this.#xpathPanel.cleanup()
      this.#xpathPanel.remove()
      this.#xpathPanel = null
    }

    // Cleanup marker observers
    if (this.#markerResizeObserver) {
      this.#markerResizeObserver.disconnect()
      this.#markerResizeObserver = null
    }

    // Create marker label web component
    const marker = document.createElement(MarkerLabel.TAG_NAME) as MarkerLabel
    marker.initialize(label, () => {
      if (this.#deleteCallback) {
        this.#deleteCallback()
      }
    })
    this.appendChild(marker)
    this.#markerLabel = marker

    // Always create XPath panel (even if no XPaths, show no-data state)
    const panel = document.createElement(MarkerXPathPanel.TAG_NAME) as MarkerXPathPanel
    panel.initialize(this.#xpaths)
    this.appendChild(panel)
    this.#xpathPanel = panel

    // Add hover event listeners on marker label to show/hide panel
    marker.addEventListener('mouseenter', () => {
      this.#cancelHidePanel()
      this.#showXPathPanel()
    })
    marker.addEventListener('mouseleave', () => {
      // Delay hide to allow mouse to move to panel
      this.#scheduleHidePanel()
    })

    // Also listen to mouseenter/leave on panel to keep it visible
    panel.addEventListener('mouseenter', () => {
      this.#cancelHidePanel()
    })
    panel.addEventListener('mouseleave', () => {
      this.#scheduleHidePanel()
    })

    // Initial marker position update
    this.#updateMarkerPosition()

    // Observe marker label and panel size changes
    if (this.#markerLabel) {
      this.#markerResizeObserver = new ResizeObserver(() => {
        this.#updateMarkerPosition()
      })
      this.#markerResizeObserver.observe(this.#markerLabel)

      // Also observe XPath panel if it exists
      if (this.#xpathPanel) {
        this.#markerResizeObserver.observe(this.#xpathPanel)
      }
    }

    // Listen to scroll and resize events for marker positioning
    window.addEventListener('scroll', this.#handleMarkerScroll, true)
    window.addEventListener('resize', this.#handleMarkerResize)
  }

  /**
   * Update XPaths array (called when XPath changes are detected)
   * @param xpaths Updated XPaths array
   */
  updateXPaths(xpaths: string[]) {
    this.#xpaths = xpaths || []
    // Keep backward compatibility
    this.#xpath = this.#xpaths.length > 0 ? this.#xpaths[0] : null

    // Update panel if it exists
    if (this.#xpathPanel) {
      this.#xpathPanel.setXPaths(this.#xpaths)
    }
  }

  /**
   * Update marker color (e.g. red when invalid so failure is visible at a glance)
   * @param color CSS color (e.g. '#ef4444' for failed, or original hex for normal)
   */
  setMarkerColor(color: string) {
    this.style.setProperty('--marker-color', color)
  }

  /**
   * Show XPath panel
   */
  #showXPathPanel() {
    if (!this.#xpathPanel) return
    this.#xpathPanel.show()
    this.#updateMarkerPosition()
  }

  /**
   * Hide XPath panel
   */
  #hideXPathPanel() {
    if (this.#xpathPanel) {
      this.#xpathPanel.hide()
    }
  }

  /**
   * Schedule hide panel with delay
   */
  #scheduleHidePanel() {
    this.#cancelHidePanel()
    this.#hidePanelTimer = setTimeout(() => {
      this.#hideXPathPanel()
      this.#hidePanelTimer = null
    }, 200) // 200ms delay
  }

  /**
   * Cancel hide panel timer
   */
  #cancelHidePanel() {
    if (this.#hidePanelTimer !== null) {
      clearTimeout(this.#hidePanelTimer)
      this.#hidePanelTimer = null
    }
  }

  /**
   * Handle scroll event for marker positioning
   */
  #handleMarkerScroll = () => {
    this.#updateMarkerPosition()
  }

  /**
   * Handle resize event for marker positioning
   */
  #handleMarkerResize = () => {
    // Reset scrollbar width cache on resize
    this.#scrollbarWidth = null
    this.#updateMarkerPosition()
  }

  /**
   * Schedule marker position update (throttled via RAF)
   */
  #updateMarkerPosition() {
    if (this.#pendingMarkerUpdate) return
    this.#pendingMarkerUpdate = true

    if (this.#markerRafId === null) {
      this.#markerRafId = requestAnimationFrame(() => {
        this.#markerRafId = null
        this.#doUpdateMarkerPosition()
      })
    }
  }

  /**
   * Update marker label and panel position to prevent overflow
   */
  #doUpdateMarkerPosition() {
    if (!this.#markerLabel || !this.#targetNode) {
      this.#pendingMarkerUpdate = false
      return
    }

    // Get highlight box position (this element)
    const highlightRect = this.getBoundingClientRect()
    const scrollbarWidth = this.#getCachedScrollbarWidth()
    const viewportWidth = window.innerWidth - scrollbarWidth
    const viewportHeight = window.innerHeight

    // Get marker label dimensions
    const markerWidth = this.#markerLabel.offsetWidth

    // Get XPath panel dimensions if it exists and is visible
    let panelWidth = 0
    let panelHeight = 0
    if (this.#xpathPanel && this.#xpathPanel.isVisible()) {
      panelWidth = this.#xpathPanel.offsetWidth
      panelHeight = this.#xpathPanel.offsetHeight
    }

    // Default position: top: -4px, left: -4px (relative to highlight box)
    // After transform: translateY(-100%), marker bottom is at -4px
    let offsetX = -4
    let offsetY = -4

    // Calculate maximum width needed (marker or panel, whichever is wider)
    const maxContentWidth = Math.max(markerWidth, panelWidth)

    // Check right edge overflow
    const rightEdge = highlightRect.left + offsetX + maxContentWidth
    const padding = 8
    if (rightEdge > viewportWidth - padding) {
      // Need to shift left
      offsetX = viewportWidth - highlightRect.left - maxContentWidth - padding
      // Ensure we don't go too far left (keep some padding from left edge)
      const minLeft = padding
      if (highlightRect.left + offsetX < minLeft) {
        offsetX = minLeft - highlightRect.left
      }
    }

    // Check left edge overflow
    const leftEdge = highlightRect.left + offsetX
    if (leftEdge < padding) {
      offsetX = padding - highlightRect.left
    }

    // Check bottom edge overflow (for XPath panel)
    if (this.#xpathPanel && this.#xpathPanel.isVisible() && panelHeight > 0) {
      // Panel is positioned at top: 0px + 4px margin (relative to marker)
      // Marker is at highlightRect.top + offsetY
      // After marker's translateY(-100%), marker bottom is at offsetY
      // Panel top should be at offsetY + 4px (margin-top)
      const panelTop = highlightRect.top + offsetY + 4
      const panelBottom = panelTop + panelHeight
      if (panelBottom > viewportHeight - padding) {
        // Shift panel up (move marker up)
        const overflow = panelBottom - (viewportHeight - padding)
        offsetY = offsetY - overflow
        // Ensure we don't go too far up
        const minTop = padding
        if (highlightRect.top + offsetY < minTop) {
          offsetY = minTop - highlightRect.top
        }
      }
    }

    // Apply offsets directly to marker label
    this.#markerLabel.style.top = `${offsetY}px`
    this.#markerLabel.style.left = `${offsetX}px`

    // Apply offsets to XPath panel (positioned below marker)
    // Marker bottom is at offsetY (after translateY(-100%)), so panel top should be at offsetY + 4px
    if (this.#xpathPanel) {
      this.#xpathPanel.style.top = `${offsetY + 4}px` // 4px spacing from marker
      this.#xpathPanel.style.left = `${offsetX}px`
    }

    this.#pendingMarkerUpdate = false
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

    this.#pendingUpdate = false
    this.#targetNode = null
  }

  /**
   * Clean up observers, event listeners, and marker label
   */
  cleanup() {
    this.#cleanupObservers()

    // Clean up marker label and panel
    if (this.#markerLabel) {
      this.#markerLabel.cleanup()
      this.#markerLabel.remove()
      this.#markerLabel = null
    }
    if (this.#xpathPanel) {
      this.#xpathPanel.cleanup()
      this.#xpathPanel.remove()
      this.#xpathPanel = null
    }

    // Cleanup marker observers
    if (this.#markerResizeObserver) {
      this.#markerResizeObserver.disconnect()
      this.#markerResizeObserver = null
    }

    // Remove marker scroll/resize listeners
    window.removeEventListener('scroll', this.#handleMarkerScroll, true)
    window.removeEventListener('resize', this.#handleMarkerResize)

    if (this.#markerRafId !== null) {
      cancelAnimationFrame(this.#markerRafId)
      this.#markerRafId = null
    }

    // Clear hide timer
    this.#cancelHidePanel()

    // Clear references
    this.#deleteCallback = null
    this.#xpath = null
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
