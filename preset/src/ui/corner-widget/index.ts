/**
 * Corner Widget Module
 *
 * Provides a customizable corner widget UI component for Tampermonkey userscripts.
 * The widget can be dragged to reposition, displays a menu panel with dynamic menu items,
 * and supports show/hide functionality.
 *
 * Features:
 * - Draggable positioning with boundary constraints
 * - Dynamic menu item management (add, remove, update)
 * - Menu panel toggle functionality
 * - Shadow DOM isolation
 * - Pre-registration support for menu items before component initialization
 *
 * @module corner-widget
 */

import { appendToDocumentElement } from '@/helpers/dom'
import { GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import { GME_notification } from '@/ui/notification/index'
import iconDrag from '~icons/mdi/drag-vertical?raw'
import iconHide from '~icons/mdi/eye-off-outline?raw'

import logoSvg from '../../../../public/logo.svg?raw'
import { bindScrollIndicator, refreshScrollIndicator } from '../shared/scroll-indicator'
import { wrapUiStyles } from '../shared/wrap-ui-styles'
import cornerWidgetCss from './index.css?raw'
import cornerWidgetHtml from './index.html?raw'

/** Menu item ids used by DEBUG demo; remove before re-adding so demo is idempotent */
const DEBUG_DEMO_IDS = ['debug-demo-1', 'debug-demo-2', 'debug-demo-3'] as const

/** Minimum pointer movement (px) before mini-state interaction counts as drag */
const MINI_DRAG_THRESHOLD_PX = 4

/** Inline logo SVG tuned for small header mark (keeps viewBox, drops fixed dimensions). */
const CORNER_WIDGET_LOGO_HTML = `<span class="corner-widget__logo-mark">${logoSvg
  .replace(/\s+width="[^"]*"/, '')
  .replace(/\s+height="[^"]*"/, '')
  .replace(/preserveAspectRatio="none"/, 'preserveAspectRatio="xMidYMid meet"')
  .replace(/\sstyle="display: block;"/, '')}</span>`

/**
 * Menu item configuration interface
 */
export interface MenuItem {
  /** Unique identifier for the menu item */
  id: string
  /** Display text of the menu item */
  text: string
  /** Optional icon to display before the text */
  icon?: string
  /** Optional hint text to display on the right side */
  hint?: string
  /** Optional callback function to execute when the menu item is clicked */
  action?: () => void
}

/**
 * Corner widget custom element
 * A draggable corner widget that displays a menu panel with customizable menu items
 * Supports drag-to-reposition, menu toggle, and dynamic menu item management
 */
export class CornerWidget extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-corner-widget'
  /** Expanded-state drag handle */
  static DRAG_SELECTOR = '.corner-widget__drag'
  /** Brand / logo click target (mini state opens menu) */
  static BRAND_SELECTOR = '.corner-widget__brand'
  /** Hide button selector */
  static HIDE_SELECTOR = '.corner-widget__hide'
  /** Mini-state drag surface */
  static CARD_SELECTOR = '.corner-widget__card'
  /** Logo mark selector */
  static LOGO_SELECTOR = '.corner-widget__logo'
  static PANEL_SELECTOR = '.corner-widget__panel'
  /** Menu list container selector */
  static LIST_SELECTOR = '.corner-widget__list'
  /** CSS class when menu panel is expanded */
  static MENU_OPEN_CLASS = 'corner-widget--menu-open'
  /** CSS class for open panel state */
  static PANEL_OPEN_CLASS = 'corner-widget__panel--open'
  /** CSS class for dragging state */
  static DRAGGING_CLASS = 'corner-widget--dragging'
  /** CSS class for menu item elements */
  static ITEM_CLASS = 'corner-widget__item'
  /** CSS class for hidden widget state */
  static HIDDEN_CLASS = 'corner-widget--hidden'
  /** CSS class when mouse has left the window (fully hide until mouse re-enters) */
  static WINDOW_OUT_CLASS = 'corner-widget--window-out'
  /** CSS class when page/element is in fullscreen (e.g. video playback) */
  static FULLSCREEN_CLASS = 'corner-widget--fullscreen'
  /** Menu item element selector */
  static MENU_ITEM_SELECTOR = '.corner-widget__item'
  /** Pre-stored menu items before component is ready */
  static PRE_MENU: MenuItem[] = []

  /** Whether UI is visible */
  #isVisible = true
  /** Whether menu is open */
  #isMenuOpen = false
  /** Whether currently dragging */
  #isDragging = false
  /** Y coordinate at drag start */
  #dragStartY = 0
  /** Current Y coordinate */
  #currentY = 0
  /** Initial bottom position */
  #initialBottom = 0
  /** X coordinate at drag start */
  #dragStartX = 0
  /** Whether pointer is down for mini drag / click */
  #pointerDown = false
  /** Whether pointer moved enough to count as drag */
  #hasDragged = false
  /** Menu items array */
  #menuItems: MenuItem[] = []
  /** Shadow DOM root */
  #shadowRoot: ShadowRoot | null = null

  /**
   * Force collapsed mini state (default on mount)
   */
  #ensureMiniMenuState() {
    this.#isMenuOpen = false
    this.setAttribute('menu-open', 'false')
    this.classList.remove(CornerWidget.MENU_OPEN_CLASS)
    this.#removeMenuKeyListener()

    const panel = this.#shadowRoot?.querySelector(CornerWidget.PANEL_SELECTOR)
    panel?.classList.remove(CornerWidget.PANEL_OPEN_CLASS)
  }

  /**
   * Render the menu list by creating DOM elements for all menu items
   * Automatically shows/hides the widget based on whether there are menu items
   */
  #renderMenu() {
    if (!this.#shadowRoot) {
      return
    }

    const listElement = this.#shadowRoot.querySelector(CornerWidget.LIST_SELECTOR) as HTMLElement
    if (!listElement) {
      return
    }
    listElement.innerHTML = ''

    this.#menuItems.forEach((item) => {
      const itemElement = this.#createMenuItem(item)
      listElement.appendChild(itemElement)
    })

    this.toggle(!!this.#menuItems.length)
    refreshScrollIndicator(listElement)
  }

  /**
   * Create a menu item element from menu item configuration
   * @param item Menu item configuration
   * @returns Created menu item HTML element
   */
  #createMenuItem(item: MenuItem): HTMLElement {
    const iconHtml = item.icon ? `<span class="corner-widget__item-icon">${item.icon}</span>` : ''
    const hintHtml = item.hint ? `<span class="corner-widget__item-hint">${item.hint}</span>` : ''
    const html = `
      <div class="corner-widget__item-content">
        <div class="corner-widget__item-left">
          ${iconHtml}<span>${item.text}</span>
        </div>
        <div class="corner-widget__item-right">
          ${hintHtml}
        </div>
      </div>
    `
    const li = document.createElement('li')
    li.className = CornerWidget.ITEM_CLASS
    li.dataset.menuId = item.id
    li.innerHTML = html
    return li
  }

  /**
   * Find a menu item by id (first-level only)
   * @param id Menu item id to find
   * @returns Found menu item or null if not found
   */
  #findMenuItemById(id: string): MenuItem | null {
    for (const item of this.#menuItems) {
      if (item.id === id) {
        return item
      }
    }

    return null
  }

  /**
   * Check whether any target in the event path matches the selector
   * @param targets Event composed path targets
   * @param selector CSS selector to match
   * @returns Whether any target matches the selector
   */
  #isMatchingTarget(targets: unknown[], selector: string) {
    return targets.some((target) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      return target.matches(selector)
    })
  }

  /**
   * Find the first matching target element from event path
   * @param targets Event composed path targets
   * @param selector CSS selector to match
   * @returns First matching HTMLElement or undefined
   */
  #findMatchingTarget(targets: unknown[], selector: string): HTMLElement | undefined {
    return targets.find((target): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      return target.matches(selector)
    })
  }

  /** Whether expanded drag is active */
  #expandedDragActive = false

  /**
   * Apply vertical drag delta and clamp within viewport
   * @param clientY Current pointer Y
   */
  #applyVerticalDrag(clientY: number) {
    const moveDeltaY = this.#dragStartY - clientY
    const newBottom = this.#initialBottom + moveDeltaY
    const maxBottom = window.innerHeight - 100
    const minBottom = 20
    const clampedBottom = Math.max(minBottom, Math.min(maxBottom, newBottom))
    this.style.bottom = `${clampedBottom}px`
  }

  /**
   * Handle pointer down in mini state: track drag vs click-to-open on logo
   * @param event Mouse event
   */
  #miniPointerDownHandler = (event: MouseEvent) => {
    if (this.#isMenuOpen) {
      return
    }

    const targets = event.composedPath()
    if (!this.#isMatchingTarget(targets, CornerWidget.CARD_SELECTOR)) {
      return
    }
    if (this.#isMatchingTarget(targets, CornerWidget.HIDE_SELECTOR)) {
      return
    }

    this.#pointerDown = true
    this.#hasDragged = false
    this.#isDragging = false
    this.#dragStartY = event.clientY
    this.#dragStartX = event.clientX
    this.#currentY = event.clientY
    this.#initialBottom = parseFloat(getComputedStyle(this).bottom) || 0

    document.addEventListener('mousemove', this.#miniPointerMoveHandler)
    document.addEventListener('mouseup', this.#miniPointerUpHandler)
  }

  /**
   * Handle pointer move in mini state
   * @param event Mouse event
   */
  #miniPointerMoveHandler = (event: MouseEvent) => {
    if (!this.#pointerDown) {
      return
    }

    const deltaY = event.clientY - this.#dragStartY
    const deltaX = event.clientX - this.#dragStartX

    if (!this.#hasDragged && (Math.abs(deltaY) > MINI_DRAG_THRESHOLD_PX || Math.abs(deltaX) > MINI_DRAG_THRESHOLD_PX)) {
      this.#hasDragged = true
      this.#isDragging = true
      this.classList.add(CornerWidget.DRAGGING_CLASS)
    }

    if (!this.#isDragging) {
      return
    }

    event.preventDefault()

    this.#currentY = event.clientY
    this.#applyVerticalDrag(this.#currentY)
  }

  /**
   * Handle pointer up in mini state: open menu on logo click, end drag otherwise
   * @param event Mouse event
   */
  #miniPointerUpHandler = (event: MouseEvent) => {
    if (!this.#pointerDown) {
      return
    }

    const targets = event.composedPath()
    const didDrag = this.#hasDragged

    this.#pointerDown = false
    this.#hasDragged = false
    this.#isDragging = false
    this.classList.remove(CornerWidget.DRAGGING_CLASS)

    document.removeEventListener('mousemove', this.#miniPointerMoveHandler)
    document.removeEventListener('mouseup', this.#miniPointerUpHandler)

    if (!didDrag && this.#isMatchingTarget(targets, CornerWidget.BRAND_SELECTOR)) {
      this.openMenu()
    }
  }

  /**
   * Keyboard activate on brand (mini state)
   * @param event Keyboard event
   */
  #brandKeydownHandler = (event: KeyboardEvent) => {
    if (this.#isMenuOpen) {
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    this.openMenu()
  }

  /** End mini drag if pointer released outside window */
  #miniPointerCancelHandler = () => {
    if (!this.#pointerDown) {
      return
    }

    this.#pointerDown = false
    this.#hasDragged = false
    this.#isDragging = false
    this.classList.remove(CornerWidget.DRAGGING_CLASS)
    document.removeEventListener('mousemove', this.#miniPointerMoveHandler)
    document.removeEventListener('mouseup', this.#miniPointerUpHandler)
  }

  /**
   * Handle drag via handle when menu is expanded
   * @param event Mouse event
   */
  #expandedDragDownHandler = (event: MouseEvent) => {
    if (!this.#isMenuOpen) {
      return
    }

    const targets = event.composedPath()
    if (!this.#isMatchingTarget(targets, CornerWidget.DRAG_SELECTOR)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    this.#expandedDragActive = true
    this.#isDragging = true
    this.#dragStartY = event.clientY
    this.#currentY = event.clientY
    this.#initialBottom = parseFloat(getComputedStyle(this).bottom) || 0
    this.classList.add(CornerWidget.DRAGGING_CLASS)

    document.addEventListener('mousemove', this.#expandedDragMoveHandler)
    document.addEventListener('mouseup', this.#expandedDragUpHandler)
  }

  /**
   * Handle pointer move while expanded drag is active
   * @param event Mouse event
   */
  #expandedDragMoveHandler = (event: MouseEvent) => {
    if (!this.#expandedDragActive) {
      return
    }

    event.preventDefault()
    this.#currentY = event.clientY
    this.#applyVerticalDrag(this.#currentY)
  }

  /**
   * End expanded drag
   */
  #expandedDragUpHandler = () => {
    if (!this.#expandedDragActive) {
      return
    }

    this.#expandedDragActive = false
    this.#isDragging = false
    this.classList.remove(CornerWidget.DRAGGING_CLASS)

    document.removeEventListener('mousemove', this.#expandedDragMoveHandler)
    document.removeEventListener('mouseup', this.#expandedDragUpHandler)
  }

  /** End expanded drag if pointer released outside window */
  #expandedDragCancelHandler = () => {
    if (!this.#expandedDragActive) {
      return
    }

    this.#expandedDragUpHandler()
  }

  /** Handle click on hide button: hide widget (visible again after page refresh) */
  #hideButtonHandler = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    this.hide()
  }

  /** Mouse left the document (e.g. to browser chrome or another window): fully hide widget */
  #windowMouseLeaveHandler = () => {
    this.classList.add(CornerWidget.WINDOW_OUT_CLASS)
  }

  /** Mouse re-entered the document: show widget again (unless user had hidden it) */
  #windowMouseEnterHandler = () => {
    this.classList.remove(CornerWidget.WINDOW_OUT_CLASS)
  }

  /** Fullscreen changed (e.g. video fullscreen): hide widget while fullscreen */
  #fullscreenChangeHandler = () => {
    const doc = document as Document & { webkitFullscreenElement?: Element }
    const isFullscreen = !!(document.fullscreenElement ?? doc.webkitFullscreenElement)
    if (isFullscreen) {
      this.classList.add(CornerWidget.FULLSCREEN_CLASS)
    } else {
      this.classList.remove(CornerWidget.FULLSCREEN_CLASS)
    }
  }

  /** Pointer left widget while menu open: collapse to mini (unless dragging) */
  #hostMouseLeaveHandler = () => {
    if (!this.#isMenuOpen) {
      return
    }
    if (this.#isDragging || this.#expandedDragActive || this.#pointerDown) {
      return
    }
    this.closeMenu()
  }

  /** Escape key: close menu */
  #escapeCloseMenu = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return
    }
    if (!this.#isMenuOpen) {
      return
    }
    event.preventDefault()
    this.closeMenu()
  }

  /** Detach escape listener when menu closes */
  #removeMenuKeyListener() {
    document.removeEventListener('keydown', this.#escapeCloseMenu)
  }

  /**
   * Handle click event on menu items
   * @param event Mouse event
   */
  #menuItemClickHandler = (event: MouseEvent) => {
    const targets = event.composedPath()
    if (!this.#isMatchingTarget(targets, CornerWidget.MENU_ITEM_SELECTOR)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const menuItem = this.#findMatchingTarget(targets, CornerWidget.MENU_ITEM_SELECTOR)
    if (!menuItem) {
      return
    }

    const menuId = menuItem.dataset.menuId
    if (!menuId) {
      return
    }

    const item = this.#findMenuItemById(menuId)
    if (!item) {
      return
    }

    if (typeof item.action === 'function') {
      item.action()
    }
  }

  /**
   * Called when the element is inserted into the DOM
   * Initializes shadow DOM, event listeners, and renders menu
   */
  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML

    this.#injectHeaderIcons()

    this.addEventListener('mousedown', this.#miniPointerDownHandler)
    this.addEventListener('mousedown', this.#expandedDragDownHandler)
    this.addEventListener('click', this.#menuItemClickHandler)
    this.addEventListener('mouseleave', this.#hostMouseLeaveHandler)

    const brand = this.#shadowRoot.querySelector(CornerWidget.BRAND_SELECTOR) as HTMLElement | null
    brand?.addEventListener('keydown', this.#brandKeydownHandler)

    const hideBtn = this.#shadowRoot.querySelector(CornerWidget.HIDE_SELECTOR) as HTMLElement | null
    hideBtn?.addEventListener('click', this.#hideButtonHandler)

    document.addEventListener('mouseleave', this.#windowMouseLeaveHandler)
    document.addEventListener('mouseenter', this.#windowMouseEnterHandler)
    document.addEventListener('mouseleave', this.#miniPointerCancelHandler)
    document.addEventListener('mouseleave', this.#expandedDragCancelHandler)
    document.addEventListener('fullscreenchange', this.#fullscreenChangeHandler)
    document.addEventListener('webkitfullscreenchange', this.#fullscreenChangeHandler)

    this.#fullscreenChangeHandler()

    // Read pre-stored menu and merge into current menu
    const pre = CornerWidget.PRE_MENU as MenuItem[]
    if (pre && pre.length) {
      this.setMenuItems([...this.#menuItems, ...pre])
      pre.length = 0
    }

    this.#renderMenu()

    const listScroller = this.#shadowRoot.querySelector(CornerWidget.LIST_SELECTOR) as HTMLElement | null
    if (listScroller) {
      bindScrollIndicator(listScroller)
    }

    this.#ensureMiniMenuState()
  }

  /**
   * Called when the element is removed from the DOM
   * Cleans up event listeners and drag state
   */
  disconnectedCallback() {
    this.#isDragging = false
    this.#pointerDown = false
    this.#expandedDragActive = false
    this.#isMenuOpen = false
    this.#removeMenuKeyListener()
    document.removeEventListener('mouseleave', this.#windowMouseLeaveHandler)
    document.removeEventListener('mouseenter', this.#windowMouseEnterHandler)
    document.removeEventListener('mouseleave', this.#miniPointerCancelHandler)
    document.removeEventListener('mouseleave', this.#expandedDragCancelHandler)
    document.removeEventListener('mousemove', this.#miniPointerMoveHandler)
    document.removeEventListener('mouseup', this.#miniPointerUpHandler)
    document.removeEventListener('mousemove', this.#expandedDragMoveHandler)
    document.removeEventListener('mouseup', this.#expandedDragUpHandler)
    document.removeEventListener('fullscreenchange', this.#fullscreenChangeHandler)
    document.removeEventListener('webkitfullscreenchange', this.#fullscreenChangeHandler)

    const brand = this.#shadowRoot?.querySelector(CornerWidget.BRAND_SELECTOR) as HTMLElement | null
    brand?.removeEventListener('keydown', this.#brandKeydownHandler)

    const hideBtn = this.#shadowRoot?.querySelector(CornerWidget.HIDE_SELECTOR) as HTMLElement | null
    hideBtn?.removeEventListener('click', this.#hideButtonHandler)

    this.removeEventListener('mousedown', this.#miniPointerDownHandler)
    this.removeEventListener('mousedown', this.#expandedDragDownHandler)
    this.removeEventListener('click', this.#menuItemClickHandler)
    this.removeEventListener('mouseleave', this.#hostMouseLeaveHandler)
  }

  /**
   * Inject MDI SVG icons into header controls
   */
  #injectHeaderIcons() {
    if (!this.#shadowRoot) {
      return
    }

    const drag = this.#shadowRoot.querySelector(CornerWidget.DRAG_SELECTOR) as HTMLElement | null
    const logo = this.#shadowRoot.querySelector(CornerWidget.LOGO_SELECTOR) as HTMLElement | null
    const hideBtn = this.#shadowRoot.querySelector(CornerWidget.HIDE_SELECTOR) as HTMLElement | null

    if (drag) {
      drag.innerHTML = iconDrag
    }
    if (logo) {
      logo.innerHTML = CORNER_WIDGET_LOGO_HTML
    }
    if (hideBtn) {
      hideBtn.innerHTML = iconHide
    }
  }

  /**
   * Add a new menu item to the widget
   * @param item Menu item to add
   */
  addMenuItem(item: MenuItem) {
    this.#menuItems.push(item)
    this.#renderMenu()
  }

  /**
   * Remove a menu item by id
   * @param id Menu item id to remove
   */
  removeMenuItem(id: string) {
    this.#menuItems = this.#menuItems.filter((item) => item.id !== id)
    this.#renderMenu()
  }

  /**
   * Update a menu item by id
   * @param id Menu item id to update
   * @param updates Partial menu item properties to update
   * @returns Whether the menu item was found and updated
   */
  updateMenuItem(id: string, updates: Partial<Omit<MenuItem, 'id'>>): boolean {
    const item = this.#findMenuItemById(id)
    if (!item) {
      return false
    }

    if (updates.text !== undefined) {
      item.text = updates.text
    }
    if (updates.icon !== undefined) {
      item.icon = updates.icon
    }
    if (updates.hint !== undefined) {
      item.hint = updates.hint
    }
    if (updates.action !== undefined) {
      item.action = updates.action
    }

    this.#renderMenu()
    return true
  }

  /**
   * Clear all menu items
   */
  clearMenu() {
    this.#menuItems = []
    this.#renderMenu()
  }

  /**
   * Replace all menu items with new items
   * @param items Array of menu items to set
   */
  setMenuItems(items: MenuItem[]) {
    this.#menuItems = [...items]
    this.#renderMenu()
  }

  /**
   * Toggle menu panel open/close state
   * @param open Whether to open the menu (defaults to toggle current state)
   */
  toggleMenu(open = !this.#isMenuOpen) {
    if (!this.#menuItems.length) {
      return
    }

    this.#isMenuOpen = open
    this.setAttribute('menu-open', open ? 'true' : 'false')
    this.classList.toggle(CornerWidget.MENU_OPEN_CLASS, open)

    const panel = this.#shadowRoot?.querySelector(CornerWidget.PANEL_SELECTOR)
    if (!panel) {
      return
    }

    if (open) {
      panel.classList.add(CornerWidget.PANEL_OPEN_CLASS)
      document.addEventListener('keydown', this.#escapeCloseMenu)
      return
    }

    panel.classList.remove(CornerWidget.PANEL_OPEN_CLASS)
    this.#removeMenuKeyListener()
  }

  /**
   * Open the menu panel
   */
  openMenu() {
    return this.toggleMenu(true)
  }

  /**
   * Close the menu panel
   */
  closeMenu() {
    return this.toggleMenu(false)
  }

  /**
   * Toggle widget visibility
   * @param visible Whether to show the widget (defaults to toggle current state)
   */
  toggle(visible = !this.#isVisible) {
    this.#isVisible = visible
    this.setAttribute('visible', visible ? 'true' : 'false')

    if (visible) {
      this.classList.remove(CornerWidget.HIDDEN_CLASS)
    } else {
      this.classList.add(CornerWidget.HIDDEN_CLASS)
      this.closeMenu()
    }
  }

  /**
   * Show the widget
   */
  show() {
    return this.toggle(true)
  }

  /**
   * Hide the widget
   */
  hide() {
    return this.toggle(false)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(CornerWidget.TAG_NAME)) {
  customElements.define(CornerWidget.TAG_NAME, CornerWidget)
}

if (typeof document !== 'undefined' && !document.querySelector(CornerWidget.TAG_NAME)) {
  const container = document.createElement(CornerWidget.TAG_NAME)
  container.innerHTML = `<template><style>${wrapUiStyles(cornerWidgetCss)}</style>${cornerWidgetHtml}</template>`
  appendToDocumentElement(container)
}

/**
 * Register a menu command to the corner widget
 * If the widget is not ready, the item will be stored in PRE_MENU and added when the widget initializes
 * @param item Menu item to register
 */
export function GME_registerMenuCommand(item: MenuItem): void {
  const pre = CornerWidget.PRE_MENU
  pre.push(item)

  const widget = document.querySelector<CornerWidget>(CornerWidget.TAG_NAME) as CornerWidget
  if (!widget) {
    return
  }

  widget.addMenuItem(item)
  const idx = pre.indexOf(item)
  if (idx >= 0) {
    pre.splice(idx, 1)
  }
}

/**
 * Update an existing menu command by id
 * @param id Menu item id to update
 * @param updates Partial menu item properties to update
 * @returns Whether the menu item was found and updated
 */
export function GME_updateMenuCommand(id: string, updates: Partial<Omit<MenuItem, 'id'>>): boolean {
  const widget = document.querySelector<CornerWidget>(CornerWidget.TAG_NAME) as CornerWidget
  if (!widget) {
    // If widget not ready, try to update in PRE_MENU
    const pre = CornerWidget.PRE_MENU
    const item = pre.find((item) => item.id === id)
    if (item) {
      if (updates.text !== undefined) {
        item.text = updates.text
      }
      if (updates.icon !== undefined) {
        item.icon = updates.icon
      }
      if (updates.hint !== undefined) {
        item.hint = updates.hint
      }
      if (updates.action !== undefined) {
        item.action = updates.action
      }
      return true
    }
    return false
  }

  return widget.updateMenuItem(id, updates)
}

/**
 * Register DEBUG command in command-palette to open a Corner Widget DEMO (development only).
 * Shows the widget with temporary demo menu items (starts in MINI state).
 */
/* Dev-only: when __IS_DEVELOP_MODE__ is false, command-palette does not register this item. */
if (typeof __IS_DEVELOP_MODE__ !== 'undefined' && __IS_DEVELOP_MODE__) {
  GME_registerCommandPaletteCommand({
    id: 'corner-widget-demo',
    keywords: ['corner', 'widget', 'demo', 'debug', 'DEBUG'],
    title: 'DEBUG Corner Widget Demo',
    icon: '◇',
    hint: 'Show corner widget with demo menu items',
    action: () => {
      const widget = document.querySelector(CornerWidget.TAG_NAME) as CornerWidget | null
      if (!widget) {
        return
      }
      DEBUG_DEMO_IDS.forEach((id) => {
        try {
          widget.removeMenuItem(id)
        } catch {
          /* ignore if not present */
        }
      })
      widget.addMenuItem({
        id: DEBUG_DEMO_IDS[0],
        text: 'Demo Item 1',
        hint: 'Click me',
        action: () => GME_notification('Demo 1 clicked', 'info', 1500),
      })
      widget.addMenuItem({
        id: DEBUG_DEMO_IDS[1],
        text: 'Demo Item 2',
        hint: 'Hint',
        action: () => GME_notification('Demo 2 clicked', 'success', 1500),
      })
      widget.addMenuItem({
        id: DEBUG_DEMO_IDS[2],
        text: 'Demo Item 3',
        action: () => GME_notification('Demo 3 clicked', 'info', 1500),
      })
      widget.show()
    },
  })
}
