/**
 * Marker floating bar host (caller + close in one pill)
 */
import { bindFloatingBarHover, createFloatingBarElement, hideFloatingBar } from './floating-bar'

export class MarkerLabel extends HTMLElement {
  static TAG_NAME = 'vercel-web-script-marker-label'

  #bar: HTMLElement | null = null
  #unbindHover: (() => void) | null = null
  #getScrollbarWidth: (() => number) | null = null

  initialize(caller: string, onDelete: () => void, getScrollbarWidth: () => number) {
    this.#getScrollbarWidth = getScrollbarWidth
    this.className = 'node-selector-marker-host'
    this.setAttribute('data-node-selector-marker', '')

    const bar = createFloatingBarElement(caller, onDelete, 'mark')
    this.#bar = bar
    this.appendChild(bar)
  }

  bindTarget(target: HTMLElement) {
    this.#unbindHover?.()
    if (!this.#bar || !this.#getScrollbarWidth) return
    this.#unbindHover = bindFloatingBarHover(target, this.#bar, this.#getScrollbarWidth)
  }

  cleanup() {
    this.#unbindHover?.()
    this.#unbindHover = null
    hideFloatingBar(this.#bar)
    this.#bar = null
    this.#getScrollbarWidth = null
  }

  disconnectedCallback() {
    this.cleanup()
  }
}

if (typeof customElements !== 'undefined' && customElements != null && !customElements.get(MarkerLabel.TAG_NAME)) {
  customElements.define(MarkerLabel.TAG_NAME, MarkerLabel)
}
