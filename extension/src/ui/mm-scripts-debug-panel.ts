import { DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE, getScriptsDebugOverrides, isScriptsDebugActive, setScriptsDebugOverrides, subscribeScriptsDebug } from './scripts-debug-state'

const TRIGGER_SIZE = 36
/** Always visible on the right edge (extension assets are local; no need to hide off-screen). */
const PANEL_RIGHT = 10
const INITIAL_BOTTOM = 96

/**
 * Dev-only floating debug panel for the Scripts page (see openapi DebugPanel pattern).
 */
export class MmScriptsDebugPanel extends HTMLElement {
  private bound = false
  /** Keep the menu hidden until explicitly opened from the floating trigger. */
  private open = false
  private bottom = INITIAL_BOTTOM
  private dragging = false
  private dragStartY = 0
  private dragStartBottom = 0
  private unsubscribeDebug: (() => void) | undefined

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.classList.remove('hidden')
    this.removeAttribute('aria-hidden')
    this.render()
    this.unsubscribeDebug = subscribeScriptsDebug(() => this.syncControls())
    this.syncControls()
  }

  disconnectedCallback(): void {
    this.unsubscribeDebug?.()
  }

  private render(): void {
    this.innerHTML = `
      <div class="mm-debug-panel-root" data-ref="root">
        <div class="mm-debug-panel-sheet" data-ref="sheet" role="dialog" aria-label="Scripts debug">
          <div class="mm-debug-panel-title">DEBUG</div>
          <label class="mm-debug-panel-row">
            <input type="checkbox" data-ref="force-loading" />
            <span>Force loading</span>
          </label>
          <label class="mm-debug-panel-row">
            <input type="checkbox" data-ref="force-error" />
            <span>Force error</span>
          </label>
          <input type="text" class="mm-debug-panel-input" data-ref="error-message" placeholder="Error message" hidden />
          <label class="mm-debug-panel-row">
            <input type="checkbox" data-ref="force-empty" />
            <span>Force empty (no data)</span>
          </label>
          <label class="mm-debug-panel-row">
            <input type="checkbox" data-ref="force-inactive-groups" />
            <span>Mock inactive scriptKey groups</span>
          </label>
          <button type="button" class="mm-debug-panel-reset" data-ref="reset">Reset overrides</button>
        </div>
        <button type="button" class="mm-debug-panel-trigger" data-ref="trigger" aria-label="Debug panel" aria-expanded="false">
          <svg class="mm-debug-panel-trigger-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 4h6l1 4 4 1v6l-4 1-1 4H9l-1-4-4-1V9l4-1 1-4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M12 9v6M9 12h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          <span class="mm-debug-panel-trigger-dot" data-ref="dot" aria-hidden="true" hidden></span>
        </button>
      </div>
    `

    const trigger = this.querySelector('[data-ref="trigger"]') as HTMLButtonElement
    const sheet = this.querySelector('[data-ref="sheet"]') as HTMLElement

    trigger?.addEventListener('click', () => {
      this.open = !this.open
      this.syncSheetVisibility(sheet, trigger)
    })

    trigger?.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.dragging = true
      this.dragStartY = e.clientY
      this.dragStartBottom = this.bottom
      trigger.setPointerCapture(e.pointerId)
    })

    trigger?.addEventListener('pointermove', (e) => {
      if (!this.dragging) {
        return
      }
      const dy = e.clientY - this.dragStartY
      this.bottom = Math.max(4, Math.min(window.innerHeight - TRIGGER_SIZE - 8, this.dragStartBottom - dy))
      this.updatePosition()
    })

    trigger?.addEventListener('pointerup', () => {
      this.dragging = false
    })
    trigger?.addEventListener('pointercancel', () => {
      this.dragging = false
    })

    this.querySelector('[data-ref="force-loading"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      if (checked) {
        setScriptsDebugOverrides({ forceLoading: true, forceError: null, forceEmpty: false })
      } else {
        setScriptsDebugOverrides({ forceLoading: false })
      }
    })

    this.querySelector('[data-ref="force-error"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      const { errorMessage } = getScriptsDebugOverrides()
      if (checked) {
        setScriptsDebugOverrides({
          forceLoading: false,
          forceEmpty: false,
          forceError: errorMessage || DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE,
        })
      } else {
        setScriptsDebugOverrides({ forceError: null })
      }
    })

    this.querySelector('[data-ref="error-message"]')?.addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).value
      setScriptsDebugOverrides({
        errorMessage: v,
        forceError: getScriptsDebugOverrides().forceError !== null ? v || DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE : null,
      })
    })

    this.querySelector('[data-ref="force-empty"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      if (checked) {
        setScriptsDebugOverrides({ forceLoading: false, forceError: null, forceEmpty: true })
      } else {
        setScriptsDebugOverrides({ forceEmpty: false })
      }
    })

    this.querySelector('[data-ref="force-inactive-groups"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      setScriptsDebugOverrides({ forceInactiveGroups: checked })
    })

    this.querySelector('[data-ref="reset"]')?.addEventListener('click', () => {
      setScriptsDebugOverrides({
        forceLoading: false,
        forceError: null,
        forceEmpty: false,
        forceInactiveGroups: false,
        errorMessage: DEFAULT_SCRIPTS_DEBUG_ERROR_MESSAGE,
      })
    })

    this.syncSheetVisibility(sheet, trigger)
    this.updatePosition()
  }

  private syncSheetVisibility(sheet: HTMLElement | null, trigger?: HTMLButtonElement | null): void {
    if (!sheet) {
      return
    }
    sheet.hidden = !this.open
    trigger?.setAttribute('aria-expanded', String(this.open))
  }

  private syncControls(): void {
    const { forceLoading, forceError, forceEmpty, forceInactiveGroups, errorMessage } = getScriptsDebugOverrides()
    const loadingEl = this.querySelector('[data-ref="force-loading"]') as HTMLInputElement | null
    const errorEl = this.querySelector('[data-ref="force-error"]') as HTMLInputElement | null
    const emptyEl = this.querySelector('[data-ref="force-empty"]') as HTMLInputElement | null
    const inactiveEl = this.querySelector('[data-ref="force-inactive-groups"]') as HTMLInputElement | null
    const messageEl = this.querySelector('[data-ref="error-message"]') as HTMLInputElement | null
    const dot = this.querySelector('[data-ref="dot"]') as HTMLElement | null

    if (loadingEl) {
      loadingEl.checked = forceLoading
    }
    if (errorEl) {
      errorEl.checked = forceError !== null
    }
    if (emptyEl) {
      emptyEl.checked = forceEmpty
    }
    if (inactiveEl) {
      inactiveEl.checked = forceInactiveGroups
    }
    if (messageEl) {
      messageEl.value = errorMessage
      messageEl.hidden = forceError === null
    }
    if (dot) {
      dot.hidden = !isScriptsDebugActive()
    }
  }

  private updatePosition(): void {
    this.style.right = `${PANEL_RIGHT}px`
    this.style.bottom = `${this.bottom}px`
  }
}

export function mountScriptsDebugPanel(): void {
  if (!customElements.get('mm-scripts-debug-panel')) {
    customElements.define('mm-scripts-debug-panel', MmScriptsDebugPanel)
  }
  const existing = document.querySelector('mm-scripts-debug-panel')
  if (!existing) {
    document.body.append(document.createElement('mm-scripts-debug-panel'))
  }
}
