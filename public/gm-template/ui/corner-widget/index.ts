// Menu item interface
interface MenuItem {
  id: string
  text: string
  icon?: string
  hint?: string
  action?: () => void
  children?: MenuItem[]
}

class CornerWidget extends HTMLElement {
  static TAG_NAME = 'vercel-web-script-corner-widget'
  // Selectors
  /** Drag area selector */
  static DRAG_SELECTOR = '.corner-widget__drag'
  static TOGGLE_SELECTOR = '.corner-widget__header'
  static PANEL_SELECTOR = '.corner-widget__panel'
  static LIST_SELECTOR = '.corner-widget__list'
  static PANEL_OPEN_CLASS = 'corner-widget__panel--open'
  static DRAGGING_CLASS = 'corner-widget--dragging'
  static ITEM_CLASS = 'corner-widget__item'
  static HIDDEN_CLASS = 'corner-widget--hidden'
  static MENU_ITEM_SELECTOR = '.corner-widget__item'
  // Pre-stored menu items before component is ready
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
  /** Menu items array */
  #menuItems: MenuItem[] = []
  /** Shadow DOM root */
  #shadowRoot: ShadowRoot | null = null

  /** Render menu list */
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
  }

  /** Create a menu item element (string template version) */
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

  /** Find a menu item by id (first-level only) */
  #findMenuItemById(id: string): MenuItem | null {
    for (const item of this.#menuItems) {
      if (item.id === id) {
        return item
      }
    }

    return null
  }

  /** Check whether any target matches the selector */
  #isMatchingTarget(targets: unknown[], selector: string) {
    return targets.some((target) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      return target.matches(selector)
    })
  }

  #findMatchingTarget(targets: unknown[], selector: string): HTMLElement | undefined {
    return targets.find((target): target is HTMLElement => {
      if (!(target instanceof HTMLElement)) {
        return false
      }

      return target.matches(selector)
    })
  }

  #mouseDownDragHandler = (event: MouseEvent) => {
    const targets = event.composedPath()
    if (!this.#isMatchingTarget(targets, CornerWidget.DRAG_SELECTOR)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    this.#isDragging = true
    this.#dragStartY = event.clientY
    this.#currentY = event.clientY

    const currentBottom = parseFloat(getComputedStyle(this).bottom) || 0
    this.#initialBottom = currentBottom

    this.style.cursor = 'grabbing'
    this.style.userSelect = 'none'
    this.classList.add(CornerWidget.DRAGGING_CLASS)

    document.addEventListener('mousemove', this.#mouseMoveDragHandler)
    document.addEventListener('mouseup', this.#mouseUpDragHandler)
  }

  #mouseMoveDragHandler = (event: MouseEvent) => {
    if (!this.#isDragging) return

    event.preventDefault()

    this.#currentY = event.clientY
    const deltaY = this.#dragStartY - this.#currentY

    const newBottom = this.#initialBottom + deltaY

    const maxBottom = window.innerHeight - 100
    const minBottom = 20

    const clampedBottom = Math.max(minBottom, Math.min(maxBottom, newBottom))

    this.style.bottom = `${clampedBottom}px`
  }

  #mouseUpDragHandler = () => {
    if (!this.#isDragging) return

    this.#isDragging = false

    this.style.cursor = ''
    this.style.userSelect = ''
    this.classList.remove(CornerWidget.DRAGGING_CLASS)

    document.removeEventListener('mousemove', this.#mouseMoveDragHandler)
    document.removeEventListener('mouseup', this.#mouseUpDragHandler)
  }

  #toggleMenuHandler = (event: MouseEvent) => {
    const targets = event.composedPath()
    if (!this.#isMatchingTarget(targets, CornerWidget.TOGGLE_SELECTOR)) {
      return
    }

    if (this.#isMatchingTarget(targets, CornerWidget.DRAG_SELECTOR)) {
      return
    }

    this.toggleMenu()
  }

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

    // Find corresponding menu item
    const item = this.#findMenuItemById(menuId)
    if (!item) {
      return
    }

    // Only trigger first-level item action (children ignored)
    if (item.action) {
      item.action()
    }
  }

  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML

    this.addEventListener('mousedown', this.#mouseDownDragHandler)
    this.addEventListener('click', this.#toggleMenuHandler)
    this.addEventListener('click', this.#menuItemClickHandler)

    // Read pre-stored menu and merge into current menu
    const pre = CornerWidget.PRE_MENU as MenuItem[]
    if (pre && pre.length) {
      this.setMenuItems([...this.#menuItems, ...pre])
      pre.length = 0
    }

    this.#renderMenu()
  }

  disconnectedCallback() {
    this.#isDragging = false

    this.removeEventListener('mousedown', this.#mouseDownDragHandler)
    this.removeEventListener('click', this.#toggleMenuHandler)
    this.removeEventListener('click', this.#menuItemClickHandler)
  }

  addMenuItem(item: MenuItem) {
    this.#menuItems.push(item)
    this.#renderMenu()
  }

  removeMenuItem(id: string) {
    this.#menuItems = this.#menuItems.filter((item) => item.id !== id)
    this.#renderMenu()
  }

  clearMenu() {
    this.#menuItems = []
    this.#renderMenu()
  }

  setMenuItems(items: MenuItem[]) {
    this.#menuItems = [...items]
    this.#renderMenu()
  }

  toggleMenu(open = !this.#isMenuOpen) {
    if (!this.#menuItems.length) {
      return
    }

    this.#isMenuOpen = open
    this.setAttribute('menu-open', open ? 'true' : 'false')

    const panel = this.#shadowRoot?.querySelector(CornerWidget.PANEL_SELECTOR)
    if (!panel) {
      return
    }

    if (open) {
      panel.classList.add(CornerWidget.PANEL_OPEN_CLASS)
      return
    }

    panel.classList.remove(CornerWidget.PANEL_OPEN_CLASS)
  }

  openMenu() {
    return this.toggleMenu(true)
  }

  closeMenu() {
    return this.toggleMenu(false)
  }

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

  show() {
    return this.toggle(true)
  }

  hide() {
    return this.toggle(false)
  }
}

if (!customElements.get('vercel-web-script-corner-widget')) {
  customElements.define('vercel-web-script-corner-widget', CornerWidget)
}

function GME_registerMenuCommand(item: MenuItem) {
  const pre = CornerWidget.PRE_MENU
  pre.push(item)

  const widget = document.querySelector<CornerWidget>(CornerWidget.TAG_NAME) as CornerWidget
  if (!widget) {
    return
  }

  widget.addMenuItem(item)
  const idx = pre.indexOf(item)
  if (idx >= 0) pre.splice(idx, 1)
}
