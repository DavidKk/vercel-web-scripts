/**
 * Node selector custom element
 * Temporary DOM selection for third-party integrations (session-only by default)
 */

import { GME_warn } from '@/helpers/logger'
import { adoptTemplateContent } from '@/helpers/safe-inner-html'
import { findElementByXPath, generateXPath } from '@/helpers/xpath'

import { MarkerHighlightBox } from './MarkerHighlightBox'
import type { MarkedNodeInfo, NodeInfo, NodeSelectorClickMode, NodeSelectorOptions } from './types'

/** Marker color when mark is invalid (node not found) */
const MARKER_COLOR_FAILED = '#ef4444'

export class NodeSelector extends HTMLElement {
  static TAG_NAME = 'vercel-web-script-node-selector'

  #isEnabled = false
  #currentHighlightTarget: HTMLElement | null = null
  #highlightBox: HTMLElement | null = null
  #closeButton: HTMLButtonElement | null = null
  #markersContainer: HTMLElement | null = null
  #onSelectCallback: ((node: HTMLElement) => void) | null = null
  #onMarkCallback: ((node: HTMLElement, markId: string | null) => void) | null = null
  #getNodeInfoCallback: ((node: HTMLElement) => NodeInfo | null) | null = null
  #clickMode: NodeSelectorClickMode | 'none' = 'none'
  #selectedNode: HTMLElement | null = null
  #resizeObserver: ResizeObserver | null = null
  #markedNodes: Record<string, MarkedNodeInfo> = {}
  #markerHighlightBoxes: Map<string, MarkerHighlightBox> = new Map()
  #markerNodeRefs: Map<string, HTMLElement> = new Map()
  #sharedMarkerResizeObserver: ResizeObserver | null = null
  #markerNodeToMarkId: Map<HTMLElement, string> = new Map()
  #generateNodeSignature: ((node: HTMLElement) => string) | null = null
  #storageKey = 'node-selector-marks'
  #persistMarks = false
  #autoRestoreMarks = false
  #shouldExcludeNode: ((node: HTMLElement) => boolean) | null = null
  #shadowRoot: ShadowRoot | null = null
  #throttleTimer: number | null = null
  #rafId: number | null = null
  #marksHidden = false
  #markColor = '#8b5cf6'
  #scrollbarWidth: number | null = null

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

  #getCachedScrollbarWidth(): number {
    if (this.#scrollbarWidth === null) {
      this.#scrollbarWidth = this.#getScrollbarWidth()
    }
    return this.#scrollbarWidth
  }

  #isSelectorUiElement(node: HTMLElement): boolean {
    return (
      node.classList.contains('node-selector-close') ||
      node.classList.contains('node-selector-marker') ||
      node.classList.contains('node-selector-marker__delete') ||
      !!node.closest('.node-selector-marker')
    )
  }

  #isPluginElement(node: HTMLElement): boolean {
    if (this.#isSelectorUiElement(node)) {
      return true
    }

    if (node.tagName.toLowerCase().startsWith('vercel-web-script-')) {
      return true
    }

    if (node.hasAttribute('data-node-selector-marker')) {
      return true
    }

    if (node.tagName.toLowerCase() === MarkerHighlightBox.TAG_NAME) {
      return true
    }

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

  #isNativeDownloadTarget(node: HTMLElement): boolean {
    const link = node.closest('a[href], area[href]')
    if (!(link instanceof HTMLAnchorElement) && !(link instanceof HTMLAreaElement)) {
      return false
    }

    return link.hasAttribute('download') || link.href.startsWith('blob:')
  }

  #shouldExclude(node: HTMLElement): boolean {
    if (this.#isPluginElement(node)) {
      return true
    }

    if (this.#isNativeDownloadTarget(node)) {
      return true
    }

    if (this.#shouldExcludeNode && this.#shouldExcludeNode(node)) {
      return true
    }

    return false
  }

  #generateStableSelector(node: HTMLElement): string {
    if (node.id) {
      return `#${node.id}`
    }

    const stableAttrs = ['data-testid', 'data-id', 'data-component-id']
    for (const attr of stableAttrs) {
      const value = node.getAttribute(attr)
      if (value) {
        return `[${attr}="${value}"]`
      }
    }

    if (node.getAttribute('name')) {
      return `[name="${node.getAttribute('name')}"]`
    }

    return this.#generatePathSelector(node)
  }

  #generatePathSelector(node: HTMLElement): string {
    const path: string[] = []
    let current: HTMLElement | null = node

    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase()
      const currentParent = current.parentElement as HTMLElement | null

      if (!currentParent) break

      const allSiblings = Array.from(currentParent.children)
      const index = allSiblings.indexOf(current)

      if (allSiblings.length === 1) {
        path.unshift(tag)
      } else {
        path.unshift(`${tag}:nth-child(${index + 1})`)
      }

      current = currentParent
    }

    return path.join(' > ')
  }

  #generateDefaultLabel(signature: string): string {
    let hash = 0
    const str = signature + Date.now().toString()
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i)
      hash = hash & hash
    }
    return '#' + Math.abs(hash).toString(16).substring(0, 6).padStart(6, '0')
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

  #updateHighlightBox() {
    if (!this.#highlightBox || !this.#currentHighlightTarget) {
      if (this.#highlightBox) {
        this.#highlightBox.classList.remove('node-selector-highlight--visible')
      }
      return
    }

    const rect = this.#currentHighlightTarget.getBoundingClientRect()
    const isFixedOrSticky = this.#hasFixedOrStickyPosition(this.#currentHighlightTarget)
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
      this.#highlightBox.style.position = 'fixed'
      this.#highlightBox.style.top = `${top}px`
      this.#highlightBox.style.left = `${left}px`
    } else {
      const scrollX = window.scrollX || document.documentElement.scrollLeft || 0
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0
      this.#highlightBox.style.position = 'absolute'
      this.#highlightBox.style.top = `${top + scrollY}px`
      this.#highlightBox.style.left = `${left + scrollX}px`
    }

    this.#highlightBox.style.width = `${width}px`
    this.#highlightBox.style.height = `${height}px`
    this.#highlightBox.classList.add('node-selector-highlight--visible')
  }

  #handleMouseMove = (event: MouseEvent) => {
    if (!this.#isEnabled) return

    if (this.#throttleTimer !== null) return
    this.#throttleTimer = window.setTimeout(() => {
      this.#throttleTimer = null
    }, 16)

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    if (!element || !(element instanceof HTMLElement)) {
      this.#clearHighlight()
      return
    }

    if (this.#shouldExclude(element)) {
      this.#clearHighlight()
      return
    }

    this.#currentHighlightTarget = element

    let highlightTarget = element
    if (this.#getNodeInfoCallback) {
      const info = this.#getNodeInfoCallback(element)
      if (info?.highlightTarget) {
        highlightTarget = info.highlightTarget
      }
    }

    if (highlightTarget !== this.#currentHighlightTarget) {
      this.#switchHighlightTarget(highlightTarget)
    }

    if (this.#rafId === null) {
      this.#rafId = requestAnimationFrame(() => {
        this.#rafId = null
        this.#updateHighlightBox()
      })
    }
  }

  #handleMouseDown = (event: MouseEvent) => {
    if (!this.#isEnabled || this.#clickMode === 'none') return

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    if (!element || !(element instanceof HTMLElement)) return

    if (this.#shouldExclude(element)) return

    if (this.#currentHighlightTarget) {
      event.preventDefault()
    }
  }

  #switchHighlightTarget(target: HTMLElement) {
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
    }

    this.#currentHighlightTarget = target

    this.#resizeObserver = new ResizeObserver(() => {
      this.#updateHighlightBox()
    })
    this.#resizeObserver.observe(target)

    this.#updateHighlightBox()
  }

  #clearHighlight() {
    this.#currentHighlightTarget = null

    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }

    if (this.#highlightBox) {
      this.#highlightBox.classList.remove('node-selector-highlight--visible')
    }
  }

  #handleKeyDown = (event: KeyboardEvent) => {
    if (!this.#isEnabled) return
    if (event.key === 'Escape' || event.keyCode === 27) {
      event.stopPropagation()
      this.disable()
    }
  }

  #handleClick = (event: MouseEvent) => {
    if (!this.#isEnabled || this.#clickMode === 'none') return

    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
    if (!element || !(element instanceof HTMLElement)) return

    if (this.#shouldExclude(element)) return

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()

    const target = this.#currentHighlightTarget || element

    switch (this.#clickMode) {
      case 'mark': {
        const markId = this.markNode(target)
        if (this.#onMarkCallback) {
          this.#onMarkCallback(target, markId)
        }
        break
      }
      case 'select': {
        if (this.#onSelectCallback) {
          this.#onSelectCallback(target)
        }
        this.#selectedNode = target
        break
      }
      case 'selectAndMark': {
        if (this.#onSelectCallback) {
          this.#onSelectCallback(target)
        }
        this.#selectedNode = target
        const markId = this.markNode(target)
        if (this.#onMarkCallback) {
          this.#onMarkCallback(target, markId)
        }
        break
      }
      default:
        break
    }
  }

  /**
   * Resolve click mode from options (explicit clickMode or legacy enableClickSelection)
   */
  #resolveClickMode(options: NodeSelectorOptions): NodeSelectorClickMode | 'none' {
    if (options.clickMode) {
      return options.clickMode
    }
    if (options.enableClickSelection) {
      return options.onSelect ? 'select' : 'mark'
    }
    return 'none'
  }

  #handleCloseClick = () => {
    this.disable()
  }

  #getMarkersContainer(): HTMLElement | null {
    if (!this.#markersContainer && this.#shadowRoot) {
      this.#markersContainer = this.#shadowRoot.querySelector('.node-selector-markers') as HTMLElement
    }
    return this.#markersContainer
  }

  #findMarkedNode(markInfo: MarkedNodeInfo): HTMLElement | null {
    const sessionNode = this.#markerNodeRefs.get(markInfo.markId)
    if (sessionNode && document.contains(sessionNode)) {
      return sessionNode
    }

    if (!this.#persistMarks) {
      return null
    }

    if (markInfo.xpaths && markInfo.xpaths.length > 0) {
      for (const xpath of markInfo.xpaths) {
        const node = findElementByXPath(xpath)
        if (node) return node
      }
    }

    if (markInfo.xpath) {
      const node = findElementByXPath(markInfo.xpath)
      if (node) return node
    }

    if (markInfo.selector) {
      return document.querySelector(markInfo.selector) as HTMLElement | null
    }

    return null
  }

  #initSharedMarkerResizeObserver() {
    if (this.#sharedMarkerResizeObserver) return

    this.#sharedMarkerResizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const node = entry.target as HTMLElement
        const markId = this.#markerNodeToMarkId.get(node)
        if (!markId) return

        const markInfo = this.#markedNodes[markId]
        if (!markInfo) return

        if (document.contains(node)) {
          const box = this.#markerHighlightBoxes.get(markId)
          if (box) {
            box.updatePosition()
          }
          if (markInfo.isValid === false) {
            markInfo.isValid = true
            this.#saveMarks()
            box?.setMarkerColor(markInfo.color || this.#markColor)
          }
        } else {
          markInfo.isValid = false
          this.#saveMarks()
          const box = this.#markerHighlightBoxes.get(markId)
          box?.setMarkerColor(MARKER_COLOR_FAILED)
        }
      })
    })
  }

  #cleanupSharedMarkerResizeObserver() {
    if (this.#sharedMarkerResizeObserver) {
      this.#sharedMarkerResizeObserver.disconnect()
      this.#sharedMarkerResizeObserver = null
    }
    this.#markerNodeToMarkId.clear()
  }

  #createMarkerHighlightBox(markId: string, node: HTMLElement, onDelete: () => void, color: string): MarkerHighlightBox {
    const highlightBox = document.createElement(MarkerHighlightBox.TAG_NAME) as MarkerHighlightBox
    highlightBox.setAttribute('data-mark-id', markId)
    highlightBox.setAttribute('data-node-selector-marker-highlight', '')
    highlightBox.style.setProperty('--marker-color', color)

    const container = this.#getMarkersContainer()
    if (container) {
      container.appendChild(highlightBox)
    }

    highlightBox.initialize(node)
    highlightBox.setCloseButton(onDelete)

    return highlightBox
  }

  #saveMarks() {
    if (!this.#persistMarks) return

    try {
      GM_setValue(this.#storageKey, this.#markedNodes)
    } catch (error) {
      GME_warn('Failed to save marks:', error)
    }
  }

  #loadMarks(): Record<string, MarkedNodeInfo> {
    if (!this.#persistMarks) {
      return {}
    }

    try {
      return GM_getValue(this.#storageKey, {}) as Record<string, MarkedNodeInfo>
    } catch (error) {
      GME_warn('Failed to load marks:', error)
      return {}
    }
  }

  connectedCallback() {
    const template = this.querySelector('template')
    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    if (template instanceof HTMLTemplateElement) {
      adoptTemplateContent(this.#shadowRoot, template)
      template.remove()
    }

    this.#highlightBox = this.#shadowRoot.querySelector('.node-selector-highlight') as HTMLElement
    this.#closeButton = this.#shadowRoot.querySelector('.node-selector-close') as HTMLButtonElement
    this.#markersContainer = this.#shadowRoot.querySelector('.node-selector-markers') as HTMLElement

    if (!this.#highlightBox || !this.#closeButton || !this.#markersContainer) {
      GME_fail('NodeSelector: Failed to find UI elements in shadow DOM', {
        highlightBox: !!this.#highlightBox,
        closeButton: !!this.#closeButton,
        markersContainer: !!this.#markersContainer,
      })
      return
    }

    this.#closeButton.addEventListener('click', this.#handleCloseClick)
    this.#closeButton.classList.remove('node-selector-close--visible')
  }

  disconnectedCallback() {
    if (this.#closeButton) {
      this.#closeButton.removeEventListener('click', this.#handleCloseClick)
    }
    this.disable()
  }

  enable(options: NodeSelectorOptions = {}) {
    if (this.#isEnabled) return

    this.#isEnabled = true
    this.#clickMode = this.#resolveClickMode(options)
    this.#onSelectCallback = options.onSelect || null
    this.#onMarkCallback = options.onMark || null
    this.#getNodeInfoCallback = options.getNodeInfo || null
    this.#generateNodeSignature = options.generateNodeSignature || null
    this.#persistMarks = options.persistMarks === true
    this.#storageKey = options.storageKey || 'node-selector-marks'
    this.#autoRestoreMarks = options.autoRestoreMarks === true
    this.#shouldExcludeNode = options.shouldExcludeNode || null
    this.#markColor = options.markColor || '#8b5cf6'

    if (this.#persistMarks && this.#autoRestoreMarks) {
      this.#markedNodes = this.#loadMarks()
      this.restoreMarks()
    }

    document.addEventListener('mousemove', this.#handleMouseMove)
    document.addEventListener('mousedown', this.#handleMouseDown, true)
    document.addEventListener('click', this.#handleClick, true)
    document.addEventListener('keydown', this.#handleKeyDown, true)

    this.#closeButton?.classList.add('node-selector-close--visible')
    this.classList.remove('node-selector--hidden')
  }

  isEnabled(): boolean {
    return this.#isEnabled
  }

  disable() {
    if (!this.#isEnabled) return

    this.#isEnabled = false
    this.#clickMode = 'none'
    this.#onSelectCallback = null
    this.#onMarkCallback = null

    document.removeEventListener('mousemove', this.#handleMouseMove)
    document.removeEventListener('mousedown', this.#handleMouseDown, true)
    document.removeEventListener('click', this.#handleClick, true)
    document.removeEventListener('keydown', this.#handleKeyDown, true)

    this.#clearHighlight()

    if (this.#throttleTimer !== null) {
      clearTimeout(this.#throttleTimer)
      this.#throttleTimer = null
    }
    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId)
      this.#rafId = null
    }

    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }

    this.#closeButton?.classList.remove('node-selector-close--visible')
  }

  getSelectedNode(): HTMLElement | null {
    return this.#selectedNode
  }

  clearSelection() {
    this.#selectedNode = null
  }

  getMarkedNodes(): MarkedNodeInfo[] {
    return Object.values(this.#markedNodes)
  }

  markNode(node: HTMLElement, label?: string, color?: string): string | null {
    if (this.#shouldExclude(node)) {
      GME_warn('Cannot mark plugin element or excluded node')
      return null
    }

    const signature = this.#generateNodeSignature ? this.#generateNodeSignature(node) : this.#generateStableSelector(node)
    const selector = this.#generateStableSelector(node)
    const xpath = this.#persistMarks ? generateXPath(node) : null

    if (this.#persistMarks && !xpath) {
      return null
    }

    const finalLabel = label || this.#generateDefaultLabel(signature)
    const markColor = color || this.#markColor
    const markId = `mark-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const markInfo: MarkedNodeInfo = {
      markId,
      signature,
      selector,
      xpath: xpath || undefined,
      xpaths: xpath ? [xpath] : [],
      label: finalLabel,
      timestamp: Date.now(),
      isValid: true,
      color: markColor,
    }

    this.#markedNodes[markId] = markInfo
    this.#markerNodeRefs.set(markId, node)
    this.#saveMarks()

    if (!this.#marksHidden) {
      const container = this.#getMarkersContainer()
      if (container) {
        const highlightBox = this.#createMarkerHighlightBox(
          markId,
          node,
          () => {
            this.unmarkNode(markId)
          },
          markColor
        )
        this.#markerHighlightBoxes.set(markId, highlightBox)

        this.#initSharedMarkerResizeObserver()
        if (this.#sharedMarkerResizeObserver) {
          this.#sharedMarkerResizeObserver.observe(node)
          this.#markerNodeToMarkId.set(node, markId)
        }
      }
    }

    return markId
  }

  unmarkNode(markId: string): boolean {
    const markInfo = this.#markedNodes[markId]
    if (!markInfo) return false

    const highlightBox = this.#markerHighlightBoxes.get(markId)
    if (highlightBox) {
      highlightBox.cleanup()
      highlightBox.remove()
      this.#markerHighlightBoxes.delete(markId)
    }

    const node = this.#markerNodeRefs.get(markId) || this.#findMarkedNode(markInfo)
    if (node && this.#sharedMarkerResizeObserver) {
      this.#sharedMarkerResizeObserver.unobserve(node)
      this.#markerNodeToMarkId.delete(node)
    }

    this.#markerNodeRefs.delete(markId)
    delete this.#markedNodes[markId]
    this.#saveMarks()

    return true
  }

  clearAllMarks() {
    const markIds = Object.keys(this.#markedNodes)
    markIds.forEach((markId) => this.unmarkNode(markId))
  }

  restoreMarks() {
    const marks = this.#loadMarks()

    Object.values(marks).forEach((markInfo) => {
      if (!markInfo.xpaths && markInfo.xpath) {
        markInfo.xpaths = [markInfo.xpath]
      } else if ((!markInfo.xpaths || markInfo.xpaths.length === 0) && markInfo.xpath) {
        markInfo.xpaths = [markInfo.xpath]
      } else if (!markInfo.xpaths) {
        markInfo.xpaths = []
      }
    })

    this.#markedNodes = marks

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
      const node = this.#findMarkedNode(markInfo)
      if (node) {
        const restoreColor = markInfo.color || this.#markColor
        markInfo.color = restoreColor
        this.#markerNodeRefs.set(markInfo.markId, node)

        const highlightBox = this.#createMarkerHighlightBox(
          markInfo.markId,
          node,
          () => {
            this.unmarkNode(markInfo.markId)
          },
          restoreColor
        )
        this.#markerHighlightBoxes.set(markInfo.markId, highlightBox)

        this.#initSharedMarkerResizeObserver()
        if (this.#sharedMarkerResizeObserver) {
          this.#sharedMarkerResizeObserver.observe(node)
          this.#markerNodeToMarkId.set(node, markInfo.markId)
        }

        markInfo.isValid = true
      } else {
        markInfo.isValid = false
      }
    })

    this.#saveMarks()
  }

  hideMarks() {
    if (this.#marksHidden) return

    this.#marksHidden = true

    this.#markerHighlightBoxes.forEach((highlightBox) => {
      highlightBox.cleanup()
      highlightBox.remove()
    })
    this.#markerHighlightBoxes.clear()
    this.#cleanupSharedMarkerResizeObserver()
  }

  showMarks() {
    if (!this.#marksHidden) return

    this.#marksHidden = false
    this.restoreMarks()
  }

  areMarksHidden(): boolean {
    return this.#marksHidden
  }
}

if (typeof customElements !== 'undefined' && customElements != null && !customElements.get(NodeSelector.TAG_NAME)) {
  customElements.define(NodeSelector.TAG_NAME, NodeSelector)
}
