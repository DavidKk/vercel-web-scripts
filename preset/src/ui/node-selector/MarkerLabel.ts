/**
 * Marker close button custom element
 * Displays only a close icon for removing a mark
 */
export class MarkerLabel extends HTMLElement {
  /** Custom element tag name */
  static TAG_NAME = 'vercel-web-script-marker-label'

  /** Delete button element */
  #deleteBtn: HTMLElement | null = null
  /** Delete callback */
  #deleteCallback: (() => void) | null = null

  /**
   * Initialize close button
   * @param onDelete Delete callback
   */
  initialize(onDelete: () => void) {
    this.#deleteCallback = onDelete

    this.className = 'node-selector-marker'
    this.setAttribute('data-node-selector-marker', '')

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

    this.appendChild(deleteBtn)
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.#deleteCallback = null
    this.#deleteBtn = null
  }

  /**
   * Disconnected callback
   */
  disconnectedCallback() {
    this.cleanup()
  }
}

// Register custom element
if (typeof customElements !== 'undefined' && customElements != null && !customElements.get(MarkerLabel.TAG_NAME)) {
  customElements.define(MarkerLabel.TAG_NAME, MarkerLabel)
}
