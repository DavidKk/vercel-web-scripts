/**
 * Marker label custom element
 * Displays a marker label with dot, text, and delete button
 * Uses existing .node-selector-marker styles
 */
export class MarkerLabel extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-marker-label'

  /** Label text element */
  #labelEl: HTMLElement | null = null
  /** Delete button element */
  #deleteBtn: HTMLElement | null = null
  /** Delete callback */
  #deleteCallback: (() => void) | null = null

  /**
   * Observed attributes
   */
  static get observedAttributes() {
    return ['label']
  }

  /**
   * Attribute changed callback
   */
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'label' && this.#labelEl) {
      this.#labelEl.textContent = newValue || ''
    }
  }

  /**
   * Initialize marker label
   * @param label Label text
   * @param onDelete Delete callback
   */
  initialize(label: string, onDelete: () => void) {
    this.#deleteCallback = onDelete

    // Add class name to use existing styles
    this.className = 'node-selector-marker'
    this.setAttribute('data-node-selector-marker', '')

    // Create dot element
    const dot = document.createElement('div')
    dot.className = 'node-selector-marker__dot'

    // Create label text element
    const labelEl = document.createElement('div')
    labelEl.className = 'node-selector-marker__label'
    labelEl.textContent = label
    this.#labelEl = labelEl

    // Create delete button
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'node-selector-marker__delete'
    deleteBtn.setAttribute('title', 'Remove mark')
    deleteBtn.setAttribute('aria-label', 'Remove mark')
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this.#deleteCallback) {
        this.#deleteCallback()
      }
    })
    this.#deleteBtn = deleteBtn

    // Append all elements
    this.appendChild(dot)
    this.appendChild(labelEl)
    this.appendChild(deleteBtn)

    // Set attribute
    this.setAttribute('label', label)
  }

  /**
   * Set label text
   * @param label Label text
   */
  setLabel(label: string) {
    if (this.#labelEl) {
      this.#labelEl.textContent = label
      this.setAttribute('label', label)
    }
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.#deleteCallback = null
    this.#labelEl = null
    this.#deleteBtn = null
  }

  /**
   * Connected callback
   */
  connectedCallback() {
    // Marker label is initialized via initialize() method
  }

  /**
   * Disconnected callback
   */
  disconnectedCallback() {
    this.cleanup()
  }
}

// Register custom element
if (!customElements.get(MarkerLabel.TAG_NAME)) {
  customElements.define(MarkerLabel.TAG_NAME, MarkerLabel)
}
