/**
 * Node selector custom element
 * Main component for selecting, highlighting, and marking DOM nodes
 */

import { GME_warn } from '../../helpers/logger'
import { MarkerHighlightBox } from './MarkerHighlightBox'
import type { MarkedNodeInfo, NodeInfo, NodeSelectorOptions } from './types'

export class NodeSelector extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-node-selector'

  /** Whether selector is enabled */
  #isEnabled = false
  /** Currently hovered node */
  #currentHoverNode: HTMLElement | null = null
  /** Current highlight target (may be parent element) */
  #currentHighlightTarget: HTMLElement | null = null
  /** Highlight box element */
  #highlightBox: HTMLElement | null = null
  /** Tooltip element */
  #tooltip: HTMLElement | null = null
  /** Markers container */
  #markersContainer: HTMLElement | null = null
  /** Select callback */
  #onSelectCallback: ((node: HTMLElement) => void) | null = null
  /** Get node info callback */
  #getNodeInfoCallback: ((node: HTMLElement) => NodeInfo) | null = null
  /** Whether click selection is enabled */
  #enableClickSelection = false
  /** Currently selected node */
  #selectedNode: HTMLElement | null = null
  /** Resize observer for highlight target */
  #resizeObserver: ResizeObserver | null = null
  /** Mutation observer for DOM changes */
  #mutationObserver: MutationObserver | null = null
  /** Marked nodes map */
  #markedNodes: Record<string, MarkedNodeInfo> = {}
  /** Marker highlight boxes map (MarkerHighlightBox instances) */
  #markerHighlightBoxes: Map<string, MarkerHighlightBox> = new Map()
  /** Shared ResizeObserver for all marked nodes (performance optimization) */
  #sharedMarkerResizeObserver: ResizeObserver | null = null
  /** Map from marked node element to markId for shared ResizeObserver callbacks */
  #markerNodeToMarkId: Map<HTMLElement, string> = new Map()
  /** Node signature generator */
  #generateNodeSignature: ((node: HTMLElement) => string) | null = null
  /** Storage key */
  #storageKey = 'node-selector-marks'
  /** Whether to auto-restore marks */
  #autoRestoreMarks = true
  /** Custom exclude function */
  #shouldExcludeNode: ((node: HTMLElement) => boolean) | null = null
  /** Shadow DOM root */
  #shadowRoot: ShadowRoot | null = null
  /** Throttle timer for mousemove */
  #throttleTimer: number | null = null
  /** RAF for position updates */
  #rafId: number | null = null
  /** Whether marks are currently hidden */
  #marksHidden = false
  /** Instance-level marker color (all marks created by this instance use this color) */
  #markColor = '#8b5cf6' // Default purple

  /**
   * Check if a node is a plugin element
   * @param node Node to check
   * @returns Whether the node is a plugin element
   */
  #isPluginElement(node: HTMLElement): boolean {
    // Check if it's a plugin custom element
    if (node.tagName.toLowerCase().startsWith('vercel-web-script-')) {
      return true
    }

    // Check if it's a marker element
    if (node.hasAttribute('data-node-selector-marker')) {
      return true
    }

    // Check if it's a marker highlight box (Web Component)
    if (node.tagName.toLowerCase() === MarkerHighlightBox.TAG_NAME) {
      return true
    }

    // Check if it's inside a plugin's Shadow DOM
    let current: Node | null = node
    while (current) {
      if (current instanceof ShadowRoot) {
        const host = current.host
        if (host && host.tagName.toLowerCase().startsWith('vercel-web-script-')) {
          return true
        }
      }
      current = current.parentNode
    }

    return false
  }

  /**
   * Check if a node should be excluded
   * @param node Node to check
   * @returns Whether the node should be excluded
   */
  #shouldExclude(node: HTMLElement): boolean {
    // Check plugin elements first
    if (this.#isPluginElement(node)) {
      return true
    }

    // Check custom exclude function
    if (this.#shouldExcludeNode && this.#shouldExcludeNode(node)) {
      return true
    }

    return false
  }

  /**
   * Generate a stable CSS selector for a node
   * @param node Node to generate selector for
   * @returns CSS selector string
   */
  #generateStableSelector(node: HTMLElement): string {
    // 1. ID selector (most stable)
    if (node.id) {
      return `#${node.id}`
    }

    // 2. Stable data attributes
    const stableAttrs = ['data-testid', 'data-id', 'data-component-id']
    for (const attr of stableAttrs) {
      const value = node.getAttribute(attr)
      if (value) {
        return `[${attr}="${value}"]`
      }
    }

    // 3. Name attribute (for form elements)
    if (node.getAttribute('name')) {
      return `[name="${node.getAttribute('name')}"]`
    }

    // 4. Path selector (fallback)
    return this.#generatePathSelector(node)
  }

  /**
   * Generate path-based selector
   * @param node Node to generate path for
   * @returns CSS selector path
   */
  #generatePathSelector(node: HTMLElement): string {
    const path: string[] = []
    let current: HTMLElement | null = node

    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase()
      const currentParent = current.parentElement as HTMLElement | null

      if (!currentParent) break

      // Calculate position among all siblings
      const allSiblings = Array.from(currentParent.children)
      const index = allSiblings.indexOf(current)

      if (allSiblings.length === 1) {
        path.unshift(tag)
      } else {
        // Use nth-child for accuracy
        path.unshift(`${tag}:nth-child(${index + 1})`)
      }

      current = currentParent
    }

    return path.join(' > ')
  }

  /**
   * Generate default label (hash) for a node
   * @param signature Node signature
   * @returns Hash label string
   */
  #generateDefaultLabel(signature: string): string {
    let hash = 0
    const str = signature + Date.now().toString()
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash = hash & hash // Convert to 32bit integer
    }
    return '#' + Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0')
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
   * Update highlight box position
   * Dynamically uses fixed or absolute positioning based on target element's position
   * - If target or any ancestor has position: fixed or sticky, use fixed positioning
   * - Otherwise, use absolute positioning relative to document
   */
  #updateHighlightBox() {
    if (!this.#highlightBox || !this.#currentHighlightTarget) {
      if (this.#highlightBox) {
        this.#highlightBox.classList.remove('node-selector-highlight--visible')
      }
      return
    }

    const rect = this.#currentHighlightTarget.getBoundingClientRect()
    const isFixedOrSticky = this.#hasFixedOrStickyPosition(this.#currentHighlightTarget)

    if (isFixedOrSticky) {
      // For fixed or sticky elements, use fixed positioning (relative to viewport)
      // Sticky elements behave like fixed when they're "stuck", so use fixed positioning
      // No need to add scroll offsets
      this.#highlightBox.style.position = 'fixed'
      this.#highlightBox.style.top = `${rect.top}px`
      this.#highlightBox.style.left = `${rect.left}px`
    } else {
      // For non-fixed/sticky elements, use absolute positioning (relative to document)
      // Add window scroll to get document-relative position
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      this.#highlightBox.style.position = 'absolute'
      this.#highlightBox.style.top = `${rect.top + scrollY}px`
      this.#highlightBox.style.left = `${rect.left + scrollX}px`
    }

    this.#highlightBox.style.width = `${rect.width}px`
    this.#highlightBox.style.height = `${rect.height}px`
    this.#highlightBox.classList.add('node-selector-highlight--visible')
  }

  /**
   * Update tooltip position and content
   * @param node Node to show info for
   * @param x Mouse X coordinate
   * @param y Mouse Y coordinate
   */
  #updateTooltip(node: HTMLElement, x: number, y: number) {
    if (!this.#tooltip) return

    if (!this.#getNodeInfoCallback) {
      this.#tooltip.classList.remove('node-selector-tooltip--visible')
      return
    }

    const info = this.#getNodeInfoCallback(node)
    if (!info) {
      this.#tooltip.classList.remove('node-selector-tooltip--visible')
      return
    }

    const titleEl = this.#tooltip.querySelector('.node-selector-tooltip__title')
    const subtitleEl = this.#tooltip.querySelector('.node-selector-tooltip__subtitle')
    const detailsEl = this.#tooltip.querySelector('.node-selector-tooltip__details')

    if (titleEl) titleEl.textContent = info.title
    if (subtitleEl) subtitleEl.textContent = info.subtitle || ''
    if (detailsEl) {
      detailsEl.innerHTML = ''
      if (info.details) {
        info.details.forEach((detail: string) => {
          const div = document.createElement('div')
          div.textContent = detail
          detailsEl.appendChild(div)
        })
      }
    }

    // Position tooltip near mouse
    const tooltipRect = this.#tooltip.getBoundingClientRect()
    const offset = 10
    let left = x + offset
    let top = y + offset

    // Adjust if out of viewport
    if (left + tooltipRect.width > window.innerWidth) {
      left = x - tooltipRect.width - offset
    }
    if (top + tooltipRect.height > window.innerHeight) {
      top = y - tooltipRect.height - offset
    }

    this.#tooltip.style.left = `${left}px`
    this.#tooltip.style.top = `${top}px`
    this.#tooltip.classList.add('node-selector-tooltip--visible')
  }

  /**
   * Handle mouse move event
   * @param event Mouse event
   */
  #handleMouseMove = (event: MouseEvent) => {
    if (!this.#isEnabled) return

    // Throttle mousemove events
    if (this.#throttleTimer !== null) return
    this.#throttleTimer = window.setTimeout(() => {
      this.#throttleTimer = null
    }, 16) // ~60fps

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    if (!element || !(element instanceof HTMLElement)) {
      this.#clearHighlight()
      return
    }

    // Check if should exclude
    if (this.#shouldExclude(element)) {
      this.#clearHighlight()
      return
    }

    this.#currentHoverNode = element

    // Get highlight target
    let highlightTarget = element
    if (this.#getNodeInfoCallback) {
      const info = this.#getNodeInfoCallback(element)
      if (info?.highlightTarget) {
        highlightTarget = info.highlightTarget
      }
    }

    // Update highlight target if changed
    if (highlightTarget !== this.#currentHighlightTarget) {
      this.#switchHighlightTarget(highlightTarget)
    }

    // Update UI
    if (this.#rafId === null) {
      this.#rafId = requestAnimationFrame(() => {
        this.#rafId = null
        this.#updateHighlightBox()
        this.#updateTooltip(element, event.clientX, event.clientY)
      })
    }
  }

  /**
   * Handle mouse down event to prevent clicks when hovering
   * This prevents page navigation/interactions when clicking on highlighted elements
   * @param event Mouse event
   */
  #handleMouseDown = (event: MouseEvent) => {
    if (!this.#isEnabled || !this.#enableClickSelection) return

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    if (!element || !(element instanceof HTMLElement)) return

    // Check if should exclude
    if (this.#shouldExclude(element)) return

    // Only prevent default if we have a highlight target
    // This prevents links from navigating, buttons from submitting, etc.
    // But we don't stop propagation to allow click event to fire
    if (this.#currentHighlightTarget) {
      event.preventDefault()
      // Don't stop propagation here - we need click event to fire
      // event.stopPropagation() // Removed to allow click event
    }
  }

  /**
   * Switch highlight target
   * @param target New highlight target
   */
  #switchHighlightTarget(target: HTMLElement) {
    // Disconnect old observer
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
    }

    this.#currentHighlightTarget = target

    // Create new observer
    this.#resizeObserver = new ResizeObserver(() => {
      this.#updateHighlightBox()
    })
    this.#resizeObserver.observe(target)

    // Update immediately
    this.#updateHighlightBox()
  }

  /**
   * Clear highlight
   */
  #clearHighlight() {
    this.#currentHoverNode = null
    this.#currentHighlightTarget = null

    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }

    if (this.#highlightBox) {
      this.#highlightBox.classList.remove('node-selector-highlight--visible')
    }

    if (this.#tooltip) {
      this.#tooltip.classList.remove('node-selector-tooltip--visible')
    }
  }

  /**
   * Handle click event
   * @param event Mouse event
   */
  #handleClick = (event: MouseEvent) => {
    if (!this.#isEnabled || !this.#enableClickSelection) return

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    if (!element || !(element instanceof HTMLElement)) return

    // Check if should exclude
    if (this.#shouldExclude(element)) return

    // Prevent default behavior and stop propagation to avoid triggering page navigation/interactions
    // This prevents links from navigating, buttons from submitting, etc.
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    // Use highlight target if available
    const target = this.#currentHighlightTarget || element

    if (this.#onSelectCallback) {
      this.#onSelectCallback(target)
    }

    this.#selectedNode = target
  }

  /**
   * Get markers container
   * @returns Markers container element
   */
  #getMarkersContainer(): HTMLElement | null {
    if (!this.#markersContainer && this.#shadowRoot) {
      this.#markersContainer = this.#shadowRoot.querySelector('.node-selector-markers') as HTMLElement
    }
    return this.#markersContainer
  }

  /**
   * Initialize shared ResizeObserver for all marked nodes (performance optimization)
   */
  #initSharedMarkerResizeObserver() {
    if (this.#sharedMarkerResizeObserver) return

    this.#sharedMarkerResizeObserver = new ResizeObserver((entries) => {
      // Process all entries in batch (more efficient than individual observers)
      entries.forEach((entry) => {
        const node = entry.target as HTMLElement
        const markId = this.#markerNodeToMarkId.get(node)
        if (!markId) return

        const selector = this.#markedNodes[markId]?.selector
        if (!selector) return

        const targetNode = document.querySelector(selector) as HTMLElement
        if (targetNode) {
          // Update highlight box target if node changed
          const box = this.#markerHighlightBoxes.get(markId)
          if (box && box.getAttribute('data-target-selector') === selector) {
            // Box will update itself, but ensure it's tracking the right node
            box.initialize(targetNode)
          }
        } else {
          // Node removed, mark as invalid
          const markInfo = this.#markedNodes[markId]
          if (markInfo) {
            markInfo.isValid = false
            this.#saveMarks()
          }
        }
      })
    })
  }

  /**
   * Clean up shared ResizeObserver
   */
  #cleanupSharedMarkerResizeObserver() {
    if (this.#sharedMarkerResizeObserver) {
      this.#sharedMarkerResizeObserver.disconnect()
      this.#sharedMarkerResizeObserver = null
    }
    this.#markerNodeToMarkId.clear()
  }

  /**
   * Create marker highlight box as Web Component
   * @param markId Mark ID
   * @param node Target node
   * @param selector CSS selector for the target node
   * @param label Label text for the marker
   * @param onDelete Callback when delete button is clicked
   * @param color Marker color (hex format)
   * @returns Highlight box element (MarkerHighlightBox instance)
   */
  #createMarkerHighlightBox(markId: string, node: HTMLElement, selector: string, label: string, onDelete: () => void, color: string): MarkerHighlightBox {
    const highlightBox = document.createElement(MarkerHighlightBox.TAG_NAME) as MarkerHighlightBox
    highlightBox.setAttribute('data-mark-id', markId)
    highlightBox.setAttribute('data-node-selector-marker-highlight', '')
    highlightBox.setAttribute('data-target-selector', selector)

    // Set color as CSS variable
    highlightBox.style.setProperty('--marker-color', color)

    const container = this.#getMarkersContainer()
    if (container) {
      container.appendChild(highlightBox)
    }

    // Initialize tracking first (this sets up observers and position tracking)
    highlightBox.initialize(node)

    // Set marker label after initialization
    // initialize() now uses #cleanupObservers() which preserves the label
    highlightBox.setMarkerLabel(label, onDelete)

    return highlightBox
  }

  /**
   * Save marks to storage
   */
  #saveMarks() {
    try {
      GM_setValue(this.#storageKey, this.#markedNodes)
    } catch (error) {
      GME_warn('Failed to save marks:', error)
    }
  }

  /**
   * Load marks from storage
   */
  #loadMarks(): Record<string, MarkedNodeInfo> {
    try {
      return GM_getValue(this.#storageKey, {}) as Record<string, MarkedNodeInfo>
    } catch (error) {
      GME_warn('Failed to load marks:', error)
      return {}
    }
  }

  /**
   * Called when element is inserted into DOM
   */
  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML

    // Get UI elements
    this.#highlightBox = this.#shadowRoot.querySelector('.node-selector-highlight') as HTMLElement
    this.#tooltip = this.#shadowRoot.querySelector('.node-selector-tooltip') as HTMLElement
    this.#markersContainer = this.#shadowRoot.querySelector('.node-selector-markers') as HTMLElement

    if (!this.#highlightBox || !this.#tooltip || !this.#markersContainer) {
      GME_fail('NodeSelector: Failed to find UI elements in shadow DOM', {
        highlightBox: !!this.#highlightBox,
        tooltip: !!this.#tooltip,
        markersContainer: !!this.#markersContainer,
        shadowRootHTML: this.#shadowRoot.innerHTML.substring(0, 500),
      })

      return
    }

    // Restore marks if enabled
    if (this.#autoRestoreMarks) {
      this.restoreMarks()
    }
  }

  /**
   * Called when element is removed from DOM
   */
  disconnectedCallback() {
    this.disable()
  }

  /**
   * Enable node selector
   * @param options Configuration options
   */
  enable(options: NodeSelectorOptions = {}) {
    if (this.#isEnabled) return

    this.#isEnabled = true
    this.#enableClickSelection = options.enableClickSelection || false
    this.#onSelectCallback = options.onSelect || null
    this.#getNodeInfoCallback = options.getNodeInfo || null
    this.#generateNodeSignature = options.generateNodeSignature || null
    this.#storageKey = options.storageKey || 'node-selector-marks'
    this.#autoRestoreMarks = options.autoRestoreMarks !== false
    this.#shouldExcludeNode = options.shouldExcludeNode || null
    // Set instance-level marker color (all marks created by this instance will use this color)
    this.#markColor = options.markColor || '#8b5cf6' // Default purple

    // Load existing marks
    this.#markedNodes = this.#loadMarks()

    // Add event listeners
    document.addEventListener('mousemove', this.#handleMouseMove)
    document.addEventListener('mousedown', this.#handleMouseDown, true) // Use capture phase
    document.addEventListener('click', this.#handleClick, true) // Use capture phase to intercept early

    // Show component
    this.classList.remove('node-selector--hidden')
  }

  /**
   * Disable node selector
   */
  disable() {
    if (!this.#isEnabled) return

    this.#isEnabled = false

    // Remove event listeners
    document.removeEventListener('mousemove', this.#handleMouseMove)
    document.removeEventListener('mousedown', this.#handleMouseDown, true)
    document.removeEventListener('click', this.#handleClick, true)

    // Clear highlight
    this.#clearHighlight()

    // Clear timers
    if (this.#throttleTimer !== null) {
      clearTimeout(this.#throttleTimer)
      this.#throttleTimer = null
    }
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId)
      this.#rafId = null
    }

    // Disconnect observers
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }
    if (this.#mutationObserver) {
      this.#mutationObserver.disconnect()
      this.#mutationObserver = null
    }

    // Clean up shared marker ResizeObserver
    this.#cleanupSharedMarkerResizeObserver()

    // Hide component (but keep markers)
    // this.classList.add('node-selector--hidden')
  }

  /**
   * Get currently selected node
   * @returns Selected node or null
   */
  getSelectedNode(): HTMLElement | null {
    return this.#selectedNode
  }

  /**
   * Clear selection
   */
  clearSelection() {
    this.#selectedNode = null
  }

  /**
   * Mark a node
   * @param node Node to mark
   * @param label Optional label (auto-generated if not provided)
   * @param color Optional custom color (hex format, e.g., '#8b5cf6'). If not provided, a random unique color will be generated
   * @returns Mark ID or null if failed
   */
  markNode(node: HTMLElement, label?: string, color?: string): string | null {
    // Check if can mark
    if (this.#shouldExclude(node)) {
      GME_warn('Cannot mark plugin element or excluded node')
      return null
    }

    // Generate signature
    const signature = this.#generateNodeSignature ? this.#generateNodeSignature(node) : this.#generateStableSelector(node)

    // Generate selector
    const selector = this.#generateStableSelector(node)

    // Generate label
    const finalLabel = label || this.#generateDefaultLabel(signature)

    // Use instance-level color (all marks from this service/instance use the same color)
    // If color is provided in markNode call, it overrides the instance color (for backward compatibility)
    const markColor = color || this.#markColor

    // Create mark info
    const markId = `mark-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const markInfo: MarkedNodeInfo = {
      markId,
      signature,
      selector,
      label: finalLabel,
      timestamp: Date.now(),
      isValid: true,
      color: markColor,
    }

    // Store mark
    this.#markedNodes[markId] = markInfo
    this.#saveMarks()

    // Only create marker highlight box if marks are not hidden
    if (!this.#marksHidden) {
      const container = this.#getMarkersContainer()
      if (container) {
        const highlightBox = this.#createMarkerHighlightBox(
          markId,
          node,
          selector,
          finalLabel,
          () => {
            this.unmarkNode(markId)
          },
          markColor
        )
        this.#markerHighlightBoxes.set(markId, highlightBox)

        // Use shared ResizeObserver for better performance (single observer handles all marked nodes)
        this.#initSharedMarkerResizeObserver()
        if (this.#sharedMarkerResizeObserver) {
          this.#sharedMarkerResizeObserver.observe(node)
          this.#markerNodeToMarkId.set(node, markId)
        }

        // Intersection observer is handled by MarkerHighlightBox itself
        // No need for separate observer for marker badge since it's inside the highlight box
      }
    }

    return markId
  }

  /**
   * Unmark a node
   * @param markId Mark ID to remove
   * @returns Whether the mark was successfully removed
   */
  unmarkNode(markId: string): boolean {
    const markInfo = this.#markedNodes[markId]
    if (!markInfo) return false

    // Remove marker highlight box (which contains the label, Web Component will clean up itself)
    const highlightBox = this.#markerHighlightBoxes.get(markId)
    if (highlightBox) {
      highlightBox.cleanup()
      highlightBox.remove()
      this.#markerHighlightBoxes.delete(markId)
    }

    // Remove from shared ResizeObserver
    if (markInfo) {
      const node = document.querySelector(markInfo.selector) as HTMLElement
      if (node && this.#sharedMarkerResizeObserver) {
        this.#sharedMarkerResizeObserver.unobserve(node)
        this.#markerNodeToMarkId.delete(node)
      }
    }

    // Remove from storage
    delete this.#markedNodes[markId]
    this.#saveMarks()

    return true
  }

  /**
   * Clear all marks
   */
  clearAllMarks() {
    const markIds = Object.keys(this.#markedNodes)
    markIds.forEach((markId) => this.unmarkNode(markId))
  }

  /**
   * Restore marks from storage
   */
  restoreMarks() {
    const marks = this.#loadMarks()
    this.#markedNodes = marks

    // Only restore marker highlight boxes if marks are not hidden
    if (this.#marksHidden) {
      this.#saveMarks()
      return
    }

    const container = this.#getMarkersContainer()
    if (!container) {
      this.#saveMarks()
      return
    }

    Object.values(marks).forEach((markInfo) => {
      // Try to find node
      const node = document.querySelector(markInfo.selector) as HTMLElement
      if (node) {
        // Use instance-level color for restored marks (or keep existing color if it was explicitly set)
        // For backward compatibility, if markInfo has a color, use it; otherwise use instance color
        const restoreColor = markInfo.color || this.#markColor
        markInfo.color = restoreColor

        // Restore marker highlight box with integrated label (as Web Component, it will track the node automatically)
        const highlightBox = this.#createMarkerHighlightBox(
          markInfo.markId,
          node,
          markInfo.selector,
          markInfo.label,
          () => {
            this.unmarkNode(markInfo.markId)
          },
          restoreColor
        )
        this.#markerHighlightBoxes.set(markInfo.markId, highlightBox)

        // Use shared ResizeObserver for better performance (single observer handles all marked nodes)
        this.#initSharedMarkerResizeObserver()
        if (this.#sharedMarkerResizeObserver) {
          this.#sharedMarkerResizeObserver.observe(node)
          this.#markerNodeToMarkId.set(node, markInfo.markId)
        }

        // Intersection observer is handled by MarkerHighlightBox itself
        markInfo.isValid = true
      } else {
        // Node not found, mark as invalid
        markInfo.isValid = false
      }
    })

    this.#saveMarks()
  }

  /**
   * Hide all marks (remove Web Components and stop observers to save resources)
   */
  hideMarks() {
    if (this.#marksHidden) return

    this.#marksHidden = true

    // Remove all marker highlight boxes from DOM
    this.#markerHighlightBoxes.forEach((highlightBox) => {
      highlightBox.cleanup()
      highlightBox.remove()
    })
    this.#markerHighlightBoxes.clear()

    // Clean up shared ResizeObserver
    this.#cleanupSharedMarkerResizeObserver()
  }

  /**
   * Show all marks (recreate Web Components and restart observers)
   */
  showMarks() {
    if (!this.#marksHidden) return

    this.#marksHidden = false

    // Restore all marks (this will recreate the marker highlight boxes)
    this.restoreMarks()
  }

  /**
   * Check if marks are currently hidden
   * @returns Whether marks are hidden
   */
  areMarksHidden(): boolean {
    return this.#marksHidden
  }
}

// Register custom element
if (!customElements.get(NodeSelector.TAG_NAME)) {
  customElements.define(NodeSelector.TAG_NAME, NodeSelector)
}
