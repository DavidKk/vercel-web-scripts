import { bindDebugPanelToAdminTab } from '../admin/mm-admin-debug-panel-visibility'
import { enhanceMmCheckboxLabel } from '../shared/mm-checkbox'
import { DEFAULT_LOGS_DEBUG_ERROR_MESSAGE, getLogsDebugOverrides, isLogsDebugActive, setLogsDebugOverrides, subscribeLogsDebug } from './logs-debug-state'

const TRIGGER_SIZE = 36
const PANEL_RIGHT = 10
const INITIAL_BOTTOM = 96

/**
 * Dev-only floating debug panel for the Logs page (see Scripts debug panel pattern).
 */
export class MmLogsDebugPanel extends HTMLElement {
  private bound = false
  private open = false
  private bottom = INITIAL_BOTTOM
  private dragging = false
  private dragStartY = 0
  private dragStartBottom = 0
  private unsubscribeDebug: (() => void) | undefined
  private unsubscribeVisibility: (() => void) | undefined
  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.open) {
      return
    }
    const path = event.composedPath()
    if (path.includes(this)) {
      return
    }
    this.open = false
    this.syncSheetVisibility(this.querySelector('[data-ref="sheet"]') as HTMLElement | null, this.querySelector('[data-ref="trigger"]') as HTMLButtonElement | null)
  }

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.render()
    document.addEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.unsubscribeDebug = subscribeLogsDebug(() => this.syncControls())
    this.unsubscribeVisibility = bindDebugPanelToAdminTab(this, 'logs')
    this.syncControls()
  }

  disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.unsubscribeDebug?.()
    this.unsubscribeVisibility?.()
  }

  private render(): void {
    this.innerHTML = `
      <div class="mm-debug-panel-root" data-ref="root">
        <div class="mm-debug-panel-sheet" data-ref="sheet" role="dialog" aria-label="Logs debug">
          <div class="mm-debug-panel-title">DEBUG</div>
          <label class="mm-debug-panel-row mm-checkbox">
            <input type="checkbox" data-ref="force-loading" />
            <span class="mm-checkbox-label">Force loading</span>
          </label>
          <label class="mm-debug-panel-row mm-checkbox">
            <input type="checkbox" data-ref="force-error" />
            <span class="mm-checkbox-label">Force error</span>
          </label>
          <input type="text" class="mm-debug-panel-input" data-ref="error-message" placeholder="Error message" hidden />
          <label class="mm-debug-panel-row mm-checkbox">
            <input type="checkbox" data-ref="force-empty" />
            <span class="mm-checkbox-label">Force empty (no data)</span>
          </label>
          <label class="mm-debug-panel-row mm-checkbox">
            <input type="checkbox" data-ref="mock-sample-entries" />
            <span class="mm-checkbox-label">Mock sample entries</span>
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

    this.querySelectorAll<HTMLLabelElement>('label.mm-debug-panel-row.mm-checkbox').forEach((label) => {
      enhanceMmCheckboxLabel(label)
    })

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
        setLogsDebugOverrides({ forceLoading: true, forceError: null, forceEmpty: false, mockSampleEntries: false })
      } else {
        setLogsDebugOverrides({ forceLoading: false })
      }
    })

    this.querySelector('[data-ref="force-error"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      const { errorMessage } = getLogsDebugOverrides()
      if (checked) {
        setLogsDebugOverrides({
          forceLoading: false,
          forceEmpty: false,
          mockSampleEntries: false,
          forceError: errorMessage || DEFAULT_LOGS_DEBUG_ERROR_MESSAGE,
        })
      } else {
        setLogsDebugOverrides({ forceError: null })
      }
    })

    this.querySelector('[data-ref="error-message"]')?.addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).value
      setLogsDebugOverrides({
        errorMessage: v,
        forceError: getLogsDebugOverrides().forceError !== null ? v || DEFAULT_LOGS_DEBUG_ERROR_MESSAGE : null,
      })
    })

    this.querySelector('[data-ref="force-empty"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      if (checked) {
        setLogsDebugOverrides({ forceLoading: false, forceError: null, forceEmpty: true, mockSampleEntries: false })
      } else {
        setLogsDebugOverrides({ forceEmpty: false })
      }
    })

    this.querySelector('[data-ref="mock-sample-entries"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      if (checked) {
        setLogsDebugOverrides({ forceLoading: false, forceError: null, forceEmpty: false, mockSampleEntries: true })
      } else {
        setLogsDebugOverrides({ mockSampleEntries: false })
      }
    })

    this.querySelector('[data-ref="reset"]')?.addEventListener('click', () => {
      setLogsDebugOverrides({
        forceLoading: false,
        forceError: null,
        forceEmpty: false,
        mockSampleEntries: false,
        errorMessage: DEFAULT_LOGS_DEBUG_ERROR_MESSAGE,
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
    const { forceLoading, forceError, forceEmpty, mockSampleEntries, errorMessage } = getLogsDebugOverrides()
    const loadingEl = this.querySelector('[data-ref="force-loading"]') as HTMLInputElement | null
    const errorEl = this.querySelector('[data-ref="force-error"]') as HTMLInputElement | null
    const emptyEl = this.querySelector('[data-ref="force-empty"]') as HTMLInputElement | null
    const mockEl = this.querySelector('[data-ref="mock-sample-entries"]') as HTMLInputElement | null
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
    if (mockEl) {
      mockEl.checked = mockSampleEntries
    }
    if (messageEl) {
      messageEl.value = errorMessage
      messageEl.hidden = forceError === null
    }
    if (dot) {
      dot.hidden = !isLogsDebugActive()
    }
  }

  private updatePosition(): void {
    this.style.right = `${PANEL_RIGHT}px`
    this.style.bottom = `${this.bottom}px`
  }
}

export function mountLogsDebugPanel(): void {
  if (!customElements.get('mm-logs-debug-panel')) {
    customElements.define('mm-logs-debug-panel', MmLogsDebugPanel)
  }
  const existing = document.querySelector('mm-logs-debug-panel')
  if (!existing) {
    document.body.append(document.createElement('mm-logs-debug-panel'))
  }
}
