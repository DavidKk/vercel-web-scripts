import { sendShellMessage } from '@ext/shared/messages'
import type { ScriptPermissionCapability } from '@shared/script-permission'
import { SCRIPT_PERMISSION_CAPABILITIES } from '@shared/script-permission'

import { bindDebugPanelToAdminTab } from '../admin/mm-admin-debug-panel-visibility'
import { enhanceMmCheckboxLabel } from '../shared/mm-checkbox'
import { MmToast } from '../shared/mm-toast'
import {
  DEBUG_PERMISSION_TEST_FILE,
  DEFAULT_PERMISSIONS_DEBUG_ERROR_MESSAGE,
  getPermissionsDebugOverrides,
  isPermissionsDebugActive,
  setPermissionsDebugOverrides,
  subscribePermissionsDebug,
} from './permissions-debug-state'

const TRIGGER_SIZE = 36
const PANEL_RIGHT = 10
const INITIAL_BOTTOM = 96

/**
 * Dev-only floating debug panel for the Permissions admin tab.
 */
export class MmPermissionsDebugPanel extends HTMLElement {
  private bound = false
  private open = false
  private bottom = INITIAL_BOTTOM
  private dragging = false
  private dragStartY = 0
  private dragStartBottom = 0
  private unsubscribeDebug: (() => void) | undefined
  private unsubscribeVisibility: (() => void) | undefined
  private readonly toast = new MmToast(document)
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
    this.unsubscribeDebug = subscribePermissionsDebug(() => this.syncControls())
    this.unsubscribeVisibility = bindDebugPanelToAdminTab(this, 'permissions')
    this.syncControls()
  }

  disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.handleDocumentPointerDown, true)
    this.unsubscribeDebug?.()
    this.unsubscribeVisibility?.()
  }

  private render(): void {
    const capabilityOptions = SCRIPT_PERMISSION_CAPABILITIES.map((cap) => `<option value="${cap}">${cap}</option>`).join('')

    this.innerHTML = `
      <div class="mm-debug-panel-root" data-ref="root">
        <div class="mm-debug-panel-sheet mm-debug-panel-sheet-wide" data-ref="sheet" role="dialog" aria-label="Permissions debug">
          <div class="mm-debug-panel-title">DEBUG</div>
          <div class="mm-debug-panel-section-label">List UI</div>
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
            <input type="checkbox" data-ref="mock-sample-rows" />
            <span class="mm-checkbox-label">Mock permission rows</span>
          </label>
          <div class="mm-debug-panel-section-label">Permission prompts (target http(s) tab)</div>
          <label class="mm-debug-panel-row mm-checkbox">
            <input type="checkbox" data-ref="focus-target-tab" />
            <span class="mm-checkbox-label">Switch to target tab</span>
          </label>
          <input type="text" class="mm-debug-panel-input" data-ref="prompt-script-key" placeholder="Script key (optional)" />
          <input type="text" class="mm-debug-panel-input" data-ref="prompt-resource" placeholder="Resource host e.g. example.com" />
          <select class="mm-debug-panel-input" data-ref="prompt-capability">${capabilityOptions}</select>
          <button type="button" class="mm-debug-panel-action mm-debug-panel-action-primary" data-ref="prompt-here">Show modal here</button>
          <button type="button" class="mm-debug-panel-action" data-ref="prompt-once">Prompt on storefront tab</button>
          <button type="button" class="mm-debug-panel-action" data-ref="prompt-batch">Batch prompt (3 capabilities)</button>
          <button type="button" class="mm-debug-panel-action" data-ref="gm-xhr-test">GM_xmlhttpRequest test</button>
          <input type="text" class="mm-debug-panel-input" data-ref="clipboard-text" placeholder="Clipboard text to write" />
          <button type="button" class="mm-debug-panel-action" data-ref="gm-clipboard-write">GM_setClipboard test</button>
          <button type="button" class="mm-debug-panel-action" data-ref="clipboard-read">Read clipboard</button>
          <button type="button" class="mm-debug-panel-action" data-ref="clear-tab-session">Clear tab session permissions</button>
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
        setPermissionsDebugOverrides({ forceLoading: true, forceError: null, forceEmpty: false, mockSampleRows: false })
      } else {
        setPermissionsDebugOverrides({ forceLoading: false })
      }
    })

    this.querySelector('[data-ref="force-error"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      const { errorMessage } = getPermissionsDebugOverrides()
      if (checked) {
        setPermissionsDebugOverrides({
          forceLoading: false,
          forceEmpty: false,
          mockSampleRows: false,
          forceError: errorMessage || DEFAULT_PERMISSIONS_DEBUG_ERROR_MESSAGE,
        })
      } else {
        setPermissionsDebugOverrides({ forceError: null })
      }
    })

    this.querySelector('[data-ref="error-message"]')?.addEventListener('input', (e) => {
      const v = (e.target as HTMLInputElement).value
      setPermissionsDebugOverrides({
        errorMessage: v,
        forceError: getPermissionsDebugOverrides().forceError !== null ? v || DEFAULT_PERMISSIONS_DEBUG_ERROR_MESSAGE : null,
      })
    })

    this.querySelector('[data-ref="force-empty"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      if (checked) {
        setPermissionsDebugOverrides({ forceLoading: false, forceError: null, forceEmpty: true, mockSampleRows: false })
      } else {
        setPermissionsDebugOverrides({ forceEmpty: false })
      }
    })

    this.querySelector('[data-ref="mock-sample-rows"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      if (checked) {
        setPermissionsDebugOverrides({ forceLoading: false, forceError: null, forceEmpty: false, mockSampleRows: true })
      } else {
        setPermissionsDebugOverrides({ mockSampleRows: false })
      }
    })

    this.querySelector('[data-ref="focus-target-tab"]')?.addEventListener('change', (e) => {
      setPermissionsDebugOverrides({ focusTargetTab: (e.target as HTMLInputElement).checked })
    })

    this.querySelector('[data-ref="prompt-script-key"]')?.addEventListener('input', (e) => {
      setPermissionsDebugOverrides({ promptScriptKey: (e.target as HTMLInputElement).value })
    })

    this.querySelector('[data-ref="prompt-resource"]')?.addEventListener('input', (e) => {
      setPermissionsDebugOverrides({ promptResource: (e.target as HTMLInputElement).value })
    })

    this.querySelector('[data-ref="prompt-capability"]')?.addEventListener('change', (e) => {
      setPermissionsDebugOverrides({ promptCapability: (e.target as HTMLSelectElement).value as ScriptPermissionCapability })
    })

    this.querySelector('[data-ref="prompt-here"]')?.addEventListener('click', () => {
      void this.runPrompt(false, 'sender', false)
    })

    this.querySelector('[data-ref="prompt-once"]')?.addEventListener('click', () => {
      void this.runPrompt(false, 'http', this.readFocusTargetTab())
    })

    this.querySelector('[data-ref="prompt-batch"]')?.addEventListener('click', () => {
      void this.runPrompt(true, 'http', this.readFocusTargetTab())
    })

    this.querySelector('[data-ref="gm-xhr-test"]')?.addEventListener('click', () => {
      void this.runGmXhrTest()
    })

    this.querySelector('[data-ref="clipboard-text"]')?.addEventListener('input', (e) => {
      setPermissionsDebugOverrides({ clipboardText: (e.target as HTMLInputElement).value })
    })

    this.querySelector('[data-ref="gm-clipboard-write"]')?.addEventListener('click', () => {
      void this.runClipboardTest('write')
    })

    this.querySelector('[data-ref="clipboard-read"]')?.addEventListener('click', () => {
      void this.runClipboardTest('read')
    })

    this.querySelector('[data-ref="clear-tab-session"]')?.addEventListener('click', () => {
      void this.clearTabSession()
    })

    this.querySelector('[data-ref="reset"]')?.addEventListener('click', () => {
      setPermissionsDebugOverrides({
        forceLoading: false,
        forceError: null,
        forceEmpty: false,
        mockSampleRows: false,
        errorMessage: DEFAULT_PERMISSIONS_DEBUG_ERROR_MESSAGE,
      })
    })

    this.syncSheetVisibility(sheet, trigger)
    this.updatePosition()
  }

  private readFocusTargetTab(): boolean {
    const overrides = getPermissionsDebugOverrides()
    const checked = (this.querySelector('[data-ref="focus-target-tab"]') as HTMLInputElement | null)?.checked ?? overrides.focusTargetTab
    setPermissionsDebugOverrides({ focusTargetTab: checked })
    return checked
  }

  private readPromptFields(): { scriptKey?: string; resource: string; capability: ScriptPermissionCapability } {
    const overrides = getPermissionsDebugOverrides()
    const scriptKey = (this.querySelector('[data-ref="prompt-script-key"]') as HTMLInputElement | null)?.value.trim() || overrides.promptScriptKey.trim()
    const resource = (this.querySelector('[data-ref="prompt-resource"]') as HTMLInputElement | null)?.value.trim() || overrides.promptResource.trim()
    const capability = ((this.querySelector('[data-ref="prompt-capability"]') as HTMLSelectElement | null)?.value as ScriptPermissionCapability) || overrides.promptCapability
    setPermissionsDebugOverrides({
      promptScriptKey: scriptKey,
      promptResource: resource || 'example.com',
      promptCapability: capability,
    })
    return {
      ...(scriptKey ? { scriptKey } : {}),
      resource: resource || 'example.com',
      capability,
    }
  }

  private async runPrompt(batch: boolean, target: 'http' | 'sender', focusTab: boolean): Promise<void> {
    const fields = this.readPromptFields()
    const response = await sendShellMessage({
      type: 'DEBUG_PERMISSION_PROMPT',
      details: {
        ...fields,
        batch,
        file: DEBUG_PERMISSION_TEST_FILE,
        target,
        focusTab,
        forcePrompt: true,
      },
    })
    if (!response.ok) {
      this.toast.show(response.error, 'error')
      return
    }
    const allowed = 'allowed' in response ? response.allowed : undefined
    const message = 'message' in response && typeof response.message === 'string' ? response.message : allowed ? 'Allowed' : 'Denied or dismissed'
    this.toast.show(allowed ? `${message} Tip: choose «Always» + Confirm to save under Permissions; «Allow once» is not listed.` : message, allowed ? 'success' : 'info')
  }

  private readClipboardText(): string {
    const overrides = getPermissionsDebugOverrides()
    const text = (this.querySelector('[data-ref="clipboard-text"]') as HTMLInputElement | null)?.value.trim() || overrides.clipboardText.trim()
    const value = text || '[VWS debug] clipboard write test'
    setPermissionsDebugOverrides({ clipboardText: value })
    return value
  }

  private async runClipboardTest(mode: 'write' | 'read'): Promise<void> {
    const text = this.readClipboardText()
    const response = await sendShellMessage({
      type: 'DEBUG_RUN_GM_PERMISSION_TEST',
      details: {
        test: mode === 'read' ? 'clipboard-read' : 'clipboard-write',
        text,
        file: DEBUG_PERMISSION_TEST_FILE,
        focusTab: this.readFocusTargetTab(),
      },
    })
    if (!response.ok) {
      this.toast.show(response.error, 'error')
      return
    }
    this.toast.show('message' in response && typeof response.message === 'string' ? response.message : 'Clipboard test dispatched on target tab', 'success')
  }

  private async runGmXhrTest(): Promise<void> {
    const { resource } = this.readPromptFields()
    const response = await sendShellMessage({
      type: 'DEBUG_RUN_GM_PERMISSION_TEST',
      details: { resource, file: DEBUG_PERMISSION_TEST_FILE, focusTab: this.readFocusTargetTab() },
    })
    if (!response.ok) {
      this.toast.show(response.error, 'error')
      return
    }
    this.toast.show('message' in response && typeof response.message === 'string' ? response.message : 'GM test dispatched on target tab', 'success')
  }

  private async clearTabSession(): Promise<void> {
    const response = await sendShellMessage({ type: 'DEBUG_CLEAR_TAB_SESSION_PERMISSIONS' })
    if (!response.ok) {
      this.toast.show(response.error, 'error')
      return
    }
    this.toast.show('message' in response && typeof response.message === 'string' ? response.message : 'Tab session permissions cleared', 'success')
  }

  private syncSheetVisibility(sheet: HTMLElement | null, trigger?: HTMLButtonElement | null): void {
    if (!sheet) {
      return
    }
    sheet.hidden = !this.open
    trigger?.setAttribute('aria-expanded', String(this.open))
  }

  private syncControls(): void {
    const { forceLoading, forceError, forceEmpty, mockSampleRows, errorMessage, promptScriptKey, promptResource, promptCapability, clipboardText, focusTargetTab } =
      getPermissionsDebugOverrides()
    const loadingEl = this.querySelector('[data-ref="force-loading"]') as HTMLInputElement | null
    const errorEl = this.querySelector('[data-ref="force-error"]') as HTMLInputElement | null
    const emptyEl = this.querySelector('[data-ref="force-empty"]') as HTMLInputElement | null
    const mockEl = this.querySelector('[data-ref="mock-sample-rows"]') as HTMLInputElement | null
    const messageEl = this.querySelector('[data-ref="error-message"]') as HTMLInputElement | null
    const scriptKeyEl = this.querySelector('[data-ref="prompt-script-key"]') as HTMLInputElement | null
    const resourceEl = this.querySelector('[data-ref="prompt-resource"]') as HTMLInputElement | null
    const capabilityEl = this.querySelector('[data-ref="prompt-capability"]') as HTMLSelectElement | null
    const clipboardTextEl = this.querySelector('[data-ref="clipboard-text"]') as HTMLInputElement | null
    const focusTargetTabEl = this.querySelector('[data-ref="focus-target-tab"]') as HTMLInputElement | null
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
      mockEl.checked = mockSampleRows
    }
    if (messageEl) {
      messageEl.value = errorMessage
      messageEl.hidden = forceError === null
    }
    if (scriptKeyEl) {
      scriptKeyEl.value = promptScriptKey
    }
    if (resourceEl) {
      resourceEl.value = promptResource
    }
    if (capabilityEl) {
      capabilityEl.value = promptCapability
    }
    if (clipboardTextEl) {
      clipboardTextEl.value = clipboardText
    }
    if (focusTargetTabEl) {
      focusTargetTabEl.checked = focusTargetTab
    }
    if (dot) {
      dot.hidden = !isPermissionsDebugActive()
    }
  }

  private updatePosition(): void {
    this.style.right = `${PANEL_RIGHT}px`
    this.style.bottom = `${this.bottom}px`
  }
}

export function mountPermissionsDebugPanel(): void {
  if (!customElements.get('mm-permissions-debug-panel')) {
    customElements.define('mm-permissions-debug-panel', MmPermissionsDebugPanel)
  }
  const existing = document.querySelector('mm-permissions-debug-panel')
  if (!existing) {
    document.body.append(document.createElement('mm-permissions-debug-panel'))
  }
}
