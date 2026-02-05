/**
 * Marker XPath panel custom element
 * Displays XPath information in a dropdown panel
 * Uses existing .node-selector-xpath-panel styles
 */
export class MarkerXPathPanel extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-marker-xpath-panel'

  /** XPath container element */
  #xpathContainer: HTMLElement | null = null
  /** Copy XPath button */
  #copyXPathBtn: HTMLButtonElement | null = null
  /** Copy JS code button */
  #copyJsBtn: HTMLButtonElement | null = null
  /** XPaths array */
  #xpaths: string[] = []
  /** Currently selected XPath index */
  #selectedIndex = 0

  /**
   * Observed attributes
   */
  static get observedAttributes() {
    return ['visible']
  }

  /**
   * Attribute changed callback
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'visible') {
      this.style.display = newValue === 'true' ? 'block' : 'none'
    }
  }

  /**
   * Copy text to clipboard
   * @param text Text to copy
   */
  async #copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        return true
      } catch (e) {
        // Failed to copy text
        return false
      }
    }
  }

  /**
   * Generate JS code for querying element by XPath
   * @param xpath XPath string
   */
  #generateJsCode(xpath: string): string {
    return `document.evaluate('${xpath.replace(/'/g, "\\'")}', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue`
  }

  /**
   * Get currently selected XPath
   */
  #getCurrentXPath(): string {
    if (this.#xpaths.length === 0) return ''
    return this.#xpaths[this.#selectedIndex] || this.#xpaths[0] || ''
  }

  /**
   * Handle copy XPath button click
   */
  #handleCopyXPath = async () => {
    const xpath = this.#getCurrentXPath()
    if (xpath) {
      const success = await this.#copyToClipboard(xpath)
      if (success && this.#copyXPathBtn) {
        const originalText = this.#copyXPathBtn.textContent
        this.#copyXPathBtn.textContent = 'Copied!'
        setTimeout(() => {
          if (this.#copyXPathBtn) {
            this.#copyXPathBtn.textContent = originalText
          }
        }, 1000)
      }
    }
  }

  /**
   * Handle copy JS code button click
   */
  #handleCopyJs = async () => {
    const xpath = this.#getCurrentXPath()
    if (xpath) {
      const jsCode = this.#generateJsCode(xpath)
      const success = await this.#copyToClipboard(jsCode)
      if (success && this.#copyJsBtn) {
        const originalText = this.#copyJsBtn.textContent
        this.#copyJsBtn.textContent = 'Copied!'
        setTimeout(() => {
          if (this.#copyJsBtn) {
            this.#copyJsBtn.textContent = originalText
          }
        }, 1000)
      }
    }
  }

  /**
   * Handle XPath item click (select an XPath)
   */
  #handleXPathClick = (index: number) => {
    this.#selectedIndex = index
    this.#updateXPathDisplay()
  }

  /**
   * Update buttons state (enable/disable based on XPaths availability)
   */
  #updateButtonsState() {
    const hasXPaths = this.#xpaths.length > 0
    if (this.#copyXPathBtn) {
      this.#copyXPathBtn.disabled = !hasXPaths
      this.#copyXPathBtn.style.opacity = hasXPaths ? '1' : '0.5'
      this.#copyXPathBtn.style.cursor = hasXPaths ? 'pointer' : 'not-allowed'
    }
    if (this.#copyJsBtn) {
      this.#copyJsBtn.disabled = !hasXPaths
      this.#copyJsBtn.style.opacity = hasXPaths ? '1' : '0.5'
      this.#copyJsBtn.style.cursor = hasXPaths ? 'pointer' : 'not-allowed'
    }
  }

  /**
   * Update XPath display
   */
  #updateXPathDisplay() {
    if (!this.#xpathContainer) return

    // Clear container
    this.#xpathContainer.innerHTML = ''

    if (this.#xpaths.length === 0) {
      const emptyState = document.createElement('div')
      emptyState.className = 'node-selector-xpath-panel__no-data'

      const icon = document.createElement('div')
      icon.className = 'node-selector-xpath-panel__no-data-icon'
      icon.innerHTML = '<!-- -->'

      const text = document.createElement('div')
      text.className = 'node-selector-xpath-panel__no-data-text'
      text.textContent = 'No valid XPath available'

      const hint = document.createElement('div')
      hint.className = 'node-selector-xpath-panel__no-data-hint'
      hint.textContent = 'XPath generation failed or could not be validated'

      emptyState.appendChild(icon)
      emptyState.appendChild(text)
      emptyState.appendChild(hint)

      if (this.#xpathContainer) {
        this.#xpathContainer.appendChild(emptyState)
      }
      return
    }

    // Create XPath items
    this.#xpaths.forEach((xpath, index) => {
      const item = document.createElement('div')
      item.className = 'node-selector-xpath-panel__item'
      if (index === this.#selectedIndex) {
        item.classList.add('node-selector-xpath-panel__item--selected')
      }

      const text = document.createElement('div')
      text.className = 'node-selector-xpath-panel__text'
      text.textContent = xpath
      item.appendChild(text)

      // Add click handler to select this XPath
      item.addEventListener('click', () => this.#handleXPathClick(index))

      if (this.#xpathContainer) {
        this.#xpathContainer.appendChild(item)
      }
    })

    // Update buttons state after updating display
    this.#updateButtonsState()
  }

  /**
   * Initialize XPath panel
   * @param xpaths XPaths array
   */
  initialize(xpaths: string[]) {
    this.#xpaths = xpaths || []
    this.#selectedIndex = 0

    // Add class name to use existing styles
    this.className = 'node-selector-xpath-panel'

    // Create XPath container
    const container = document.createElement('div')
    container.className = 'node-selector-xpath-panel__container'
    this.#xpathContainer = container

    // Create footer with buttons
    const footer = document.createElement('div')
    footer.className = 'node-selector-xpath-panel__footer'

    // Create copy XPath button
    const copyXPathBtn = document.createElement('button')
    copyXPathBtn.className = 'node-selector-xpath-panel__btn node-selector-xpath-panel__btn--copy-xpath'
    copyXPathBtn.textContent = 'Copy XPath'
    copyXPathBtn.setAttribute('title', 'Copy selected XPath')
    copyXPathBtn.addEventListener('click', this.#handleCopyXPath)
    this.#copyXPathBtn = copyXPathBtn
    footer.appendChild(copyXPathBtn)

    // Create copy JS code button
    const copyJsBtn = document.createElement('button')
    copyJsBtn.className = 'node-selector-xpath-panel__btn node-selector-xpath-panel__btn--copy-js'
    copyJsBtn.textContent = 'Copy JS'
    copyJsBtn.setAttribute('title', 'Copy JS query code')
    copyJsBtn.addEventListener('click', this.#handleCopyJs)
    this.#copyJsBtn = copyJsBtn
    footer.appendChild(copyJsBtn)

    // Disable buttons if no XPaths available
    this.#updateButtonsState()

    // Append elements (container first, then buttons at bottom)
    this.appendChild(container)
    this.appendChild(footer)

    // Update display
    this.#updateXPathDisplay()

    // Set initial state (hidden)
    this.style.display = 'none'
    this.setAttribute('visible', 'false')
  }

  /**
   * Set XPaths array
   * @param xpaths XPaths array
   */
  setXPaths(xpaths: string[]) {
    this.#xpaths = xpaths || []
    // Keep selected index within bounds
    if (this.#selectedIndex >= this.#xpaths.length) {
      this.#selectedIndex = Math.max(0, this.#xpaths.length - 1)
    }
    this.#updateXPathDisplay()
    // Update buttons state
    this.#updateButtonsState()
  }

  /**
   * Show panel
   */
  show() {
    this.style.display = 'block'
    this.setAttribute('visible', 'true')
  }

  /**
   * Hide panel
   */
  hide() {
    this.style.display = 'none'
    this.setAttribute('visible', 'false')
  }

  /**
   * Check if panel is visible
   */
  isVisible(): boolean {
    return this.style.display !== 'none' && this.getAttribute('visible') === 'true'
  }

  /**
   * Cleanup
   */
  cleanup() {
    if (this.#copyXPathBtn) {
      this.#copyXPathBtn.removeEventListener('click', this.#handleCopyXPath)
      this.#copyXPathBtn = null
    }
    if (this.#copyJsBtn) {
      this.#copyJsBtn.removeEventListener('click', this.#handleCopyJs)
      this.#copyJsBtn = null
    }
    this.#xpathContainer = null
    this.#xpaths = []
    this.#selectedIndex = 0
  }

  /**
   * Connected callback
   */
  connectedCallback() {
    // XPath panel is initialized via initialize() method
  }

  /**
   * Disconnected callback
   */
  disconnectedCallback() {
    this.cleanup()
  }
}

// Register custom element
if (!customElements.get(MarkerXPathPanel.TAG_NAME)) {
  customElements.define(MarkerXPathPanel.TAG_NAME, MarkerXPathPanel)
}
