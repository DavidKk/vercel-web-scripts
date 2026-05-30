import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, type ExtensionConfig } from '@ext/types'

const STATUS_BASE = 'mm-options-status-pill'

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
    this.querySelector('[data-action="test"]')?.addEventListener('click', () => {
      void this.testConnection()
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

  private readFormConfig(): ExtensionConfig {
    return {
      baseUrl: (this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value.trim().replace(/\/$/, ''),
      scriptKey: (this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value.trim(),
      developMode: (this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked,
    }
  }

  private validateConfig(config: ExtensionConfig): boolean {
    if (!config.baseUrl || !config.scriptKey) {
      this.setStatus('Please enter Server URL and Script Key.', 'error')
      return false
    }
    return true
  }

  private async testConnection(): Promise<void> {
    const config = this.readFormConfig()
    if (!this.validateConfig(config)) {
      return
    }

    this.setStatus('Testing connection…')
    try {
      const url = `${config.baseUrl}/api/tampermonkey/${encodeURIComponent(config.scriptKey)}/scripts/version`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        this.setStatus(`Connection failed: HTTP ${res.status}`, 'error')
        return
      }
      const body = (await res.json()) as { code?: number; data?: { gistUpdatedAt?: number } }
      if (body.code !== 0 || typeof body.data?.gistUpdatedAt !== 'number') {
        this.setStatus('Connection failed: invalid response.', 'error')
        return
      }
      this.setStatus('Connection OK.', 'ok')
    } catch (error) {
      this.setStatus(error instanceof Error ? `Connection failed: ${error.message}` : 'Connection failed.', 'error')
    }
  }

  private async save(): Promise<void> {
    const config = this.readFormConfig()
    if (!this.validateConfig(config)) {
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
