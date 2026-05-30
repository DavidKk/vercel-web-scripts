import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type ExtensionConfig } from '@ext/types'

const STATUS_BASE = 'text-sm'

/**
 * Options page controller — light DOM only.
 * Markup lives in options/index.html; this element wires storage read/write.
 */
export class MmOptionsApp extends HTMLElement {
  private bound = false

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.bindEvents()
    void this.load()
  }

  private bindEvents(): void {
    this.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      void this.save()
    })
    this.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      void this.reset()
    })
  }

  private async load(): Promise<void> {
    const result = await chrome.storage.local.get(CONFIG_STORAGE_KEY)
    const config = (result[CONFIG_STORAGE_KEY] as ExtensionConfig | undefined) ?? DEFAULT_CONFIG
    this.applyConfig(config)
  }

  private applyConfig(config: ExtensionConfig): void {
    ;(this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = config.baseUrl
    ;(this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value = config.scriptKey
    ;(this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = config.developMode !== false
  }

  private setStatus(text: string, variant: 'idle' | 'ok' | 'error' = 'idle'): void {
    const statusEl = this.querySelector('[data-ref="status"]') as HTMLElement | null
    if (!statusEl) {
      return
    }
    statusEl.textContent = text
    statusEl.className = variant === 'error' ? `${STATUS_BASE} text-mm-danger` : variant === 'ok' ? `${STATUS_BASE} text-mm-success` : `${STATUS_BASE} text-mm-text-muted`
  }

  private async save(): Promise<void> {
    const config: ExtensionConfig = {
      baseUrl: (this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value.trim().replace(/\/$/, ''),
      scriptKey: (this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value.trim(),
      developMode: (this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked,
    }
    if (!config.baseUrl || !config.scriptKey) {
      this.setStatus('Please enter Server URL and Script Key.', 'error')
      return
    }
    await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: config })
    this.setStatus('Saved. Reload open tabs for changes to take effect.', 'ok')
  }

  private async reset(): Promise<void> {
    this.applyConfig(DEFAULT_CONFIG)
    await chrome.storage.local.set({ [CONFIG_STORAGE_KEY]: DEFAULT_CONFIG })
    this.setStatus('Reset to defaults.', 'ok')
  }
}
