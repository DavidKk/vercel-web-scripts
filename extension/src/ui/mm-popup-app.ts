import { sendShellMessage } from '@ext/shared/messages'

import { hydrateMmIcons, setIconSlotLoading } from './mm-icons'

/**
 * Popup controller — light DOM only. Markup lives in shell/popup/index.html.
 */
export class MmPopupApp extends HTMLElement {
  private bound = false
  private toastTimer: ReturnType<typeof setTimeout> | undefined

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    this.bindEvents()
    void this.refresh()
  }

  disconnectedCallback(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
    }
  }

  private bindEvents(): void {
    this.querySelector('[data-action="options"]')?.addEventListener('click', () => {
      void sendShellMessage({ type: 'OPEN_OPTIONS' })
    })
    this.querySelector('[data-action="editor"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'OPEN_EDITOR' }), 'editor')
    })
    this.querySelector('[data-action="update"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'UPDATE_RUNTIME' }), 'update')
    })
    this.querySelector('[data-action="reload"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'RELOAD_ACTIVE_TAB' }), 'reload')
    })
    this.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      if (!window.confirm('Reset runtime state and reload?')) {
        return
      }
      void this.run(() => sendShellMessage({ type: 'RESET_RUNTIME' }), 'reset')
    })
    this.querySelector('[data-action="scripts"]')?.addEventListener('click', () => {
      void sendShellMessage({ type: 'OPEN_SCRIPTS_PAGE' })
    })
    this.querySelector('[data-action="sync-rules"]')?.addEventListener('click', () => {
      void this.run(() => sendShellMessage({ type: 'SYNC_RULES' }), 'sync-rules')
    })
    this.querySelector('[data-ref="network"]')?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked
      void this.run(() => sendShellMessage({ type: 'SET_NETWORK', enabled: checked }), 'network')
    })
  }

  private getActionIconSlot(action: string): HTMLElement | null {
    if (action === 'network') {
      return this.querySelector('.mm-switch-row [data-icon="network"]')
    }
    return this.querySelector(`[data-action="${action}"] [data-icon]`)
  }

  private setActionLoading(action: string, loading: boolean): void {
    const iconSlot = this.getActionIconSlot(action)
    if (iconSlot) {
      setIconSlotLoading(iconSlot, loading)
    }

    if (action === 'network') {
      const input = this.querySelector('[data-ref="network"]') as HTMLInputElement | null
      if (input) {
        input.disabled = loading
      }
      return
    }

    const btn = this.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null
    if (btn) {
      btn.disabled = loading
    }
  }

  private showToast(text: string, isError = false): void {
    const toast = this.querySelector('[data-ref="toast"]') as HTMLElement | null
    if (!toast) {
      return
    }
    toast.textContent = text
    toast.className = isError ? 'mm-toast mm-toast-visible mm-toast-error' : 'mm-toast mm-toast-visible mm-toast-success'
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
    }
    this.toastTimer = setTimeout(() => {
      toast.className = 'mm-toast'
      toast.textContent = ''
    }, 2500)
  }

  private async run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>, loadingAction: string): Promise<void> {
    this.setActionLoading(loadingAction, true)
    try {
      const res = await action()
      if (!res.ok) {
        this.showToast(res.error ?? 'Failed', true)
        return
      }
      if (res.message) {
        this.showToast(res.message)
      }
      await this.refresh()
    } finally {
      this.setActionLoading(loadingAction, false)
    }
  }

  private async refresh(): Promise<void> {
    const res = await sendShellMessage({ type: 'GET_STATUS' })
    if (!res.ok) {
      this.showToast(res.error, true)
      return
    }
    if (!('status' in res) || !res.status) {
      this.showToast('No status', true)
      return
    }
    const s = res.status

    const subtitle = this.querySelector('[data-ref="subtitle"]')
    if (subtitle) {
      subtitle.textContent = s.configured ? s.baseUrl : 'Configure in Options'
    }

    const network = this.querySelector('[data-ref="network"]') as HTMLInputElement | null
    if (network) {
      network.checked = s.networkEnabled
    }
    const triggerHint = this.querySelector('[data-ref="trigger-hint"]')
    if (triggerHint) {
      triggerHint.textContent =
        s.triggeredCountOnActiveTab > 0
          ? `${s.triggeredCountOnActiveTab} script trigger(s) on this page load`
          : s.configured
            ? 'No scripts triggered on this page load'
            : 'Configure in Options to track script triggers'
    }
    const version = this.querySelector('[data-ref="version"]')
    if (version) {
      version.textContent = `v${s.extensionVersion}`
    }
  }
}
