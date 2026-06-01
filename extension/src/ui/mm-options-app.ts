import { isValidScriptKeyFormat, resolveOtaEndpoint } from '@ext/shared/extension-services'
import {
  createServiceFromOptions,
  loadActiveServiceDetail,
  moveService,
  removeService,
  resetOptionsServiceConfig,
  saveActiveServiceFromOptions,
  setActiveServiceId,
} from '@ext/shared/extension-storage'
import { DEFAULT_CONFIG, type ServiceProfile, SERVICES_STORAGE_KEY } from '@ext/types'

import { hydrateMmIcons, setIconSlotLoading } from './mm-icons'

const STATUS_BASE = 'mm-servers-status'

type DetailMode = 'empty' | 'edit' | 'create'

/**
 * Options page controller — multi-service list + detail panel.
 */
export class MmOptionsApp extends HTMLElement {
  private bound = false
  private createMode = false
  private activeServiceId: string | null = null
  private services: ServiceProfile[] = []
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  private testButtonTimer: ReturnType<typeof setTimeout> | undefined

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    this.bindEvents()
    void this.reload()

    this.storageListener = (changes, area) => {
      if (area === 'local' && changes[SERVICES_STORAGE_KEY]) {
        void this.reload({ preserveDraft: this.createMode })
      }
    }
    chrome.storage.onChanged.addListener(this.storageListener)
  }

  disconnectedCallback(): void {
    if (this.testButtonTimer) {
      clearTimeout(this.testButtonTimer)
      this.testButtonTimer = undefined
    }
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener)
      this.storageListener = undefined
    }
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
    this.querySelector('[data-action="add-service"]')?.addEventListener('click', () => {
      this.enterCreateMode()
    })
    this.querySelector('[data-action="move-up"]')?.addEventListener('click', () => {
      void this.moveActive('up')
    })
    this.querySelector('[data-action="move-down"]')?.addEventListener('click', () => {
      void this.moveActive('down')
    })
    this.querySelector('[data-action="delete-service"]')?.addEventListener('click', () => {
      void this.deleteActive()
    })

    this.querySelector('[data-ref="script-key"]')?.addEventListener('input', () => {
      this.updateScriptKeyHint()
    })
  }

  private async reload(options?: { preserveDraft?: boolean }): Promise<void> {
    const detail = await loadActiveServiceDetail()
    this.services = detail.state.services
    if (!options?.preserveDraft) {
      this.createMode = false
      this.activeServiceId = detail.service?.id ?? null
    }
    this.renderServiceList()
    if (this.createMode) {
      this.setDetailMode('create')
      return
    }
    if (detail.service) {
      this.applyServiceDetail(detail.service, detail.gmScope, detail.scriptKeyRefCount)
      this.setDetailMode('edit')
      return
    }
    this.setDetailMode('empty')
  }

  private renderServiceList(): void {
    const listEl = this.querySelector('[data-ref="service-list"]') as HTMLUListElement | null
    const emptyEl = this.querySelector('[data-ref="service-list-empty"]') as HTMLElement | null
    if (!listEl || !emptyEl) {
      return
    }

    listEl.replaceChildren()
    const scriptKeyCounts = new Map<string, number>()
    for (const service of this.services) {
      const key = service.scriptKey.trim()
      scriptKeyCounts.set(key, (scriptKeyCounts.get(key) ?? 0) + 1)
    }

    for (const service of this.services) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'mm-options-service-item'
      button.setAttribute('role', 'option')
      button.dataset.serviceId = service.id
      button.setAttribute('aria-selected', String(!this.createMode && service.id === this.activeServiceId))

      const label = document.createElement('span')
      label.className = 'mm-options-service-item-label'
      label.textContent = service.label || service.baseUrl

      const meta = document.createElement('span')
      meta.className = 'mm-options-service-item-meta'
      meta.textContent = `${service.baseUrl} · ${this.shortScriptKey(service.scriptKey)}`

      const badges = document.createElement('span')
      badges.className = 'mm-options-service-item-badges'

      const enabledBadge = document.createElement('span')
      enabledBadge.className = `mm-options-service-badge${service.enabled ? '' : ' is-off'}`
      enabledBadge.textContent = service.enabled ? 'Enabled' : 'Disabled'
      badges.appendChild(enabledBadge)

      if ((scriptKeyCounts.get(service.scriptKey.trim()) ?? 0) > 1) {
        const sharedBadge = document.createElement('span')
        sharedBadge.className = 'mm-options-service-badge is-shared'
        sharedBadge.textContent = 'Same script key'
        badges.appendChild(sharedBadge)
      }

      if (service.developMode) {
        const devBadge = document.createElement('span')
        devBadge.className = 'mm-options-service-badge'
        devBadge.textContent = 'Dev'
        badges.appendChild(devBadge)
      }

      const otaService = resolveOtaEndpoint(service.scriptKey, this.services)
      if (otaService?.id === service.id && service.enabled) {
        const otaBadge = document.createElement('span')
        otaBadge.className = 'mm-options-service-badge'
        otaBadge.textContent = 'OTA primary'
        badges.appendChild(otaBadge)
      }

      button.append(label, meta, badges)
      button.addEventListener('click', () => {
        void this.selectService(service.id)
      })
      item.appendChild(button)
      listEl.appendChild(item)
    }

    emptyEl.classList.toggle('hidden', this.services.length > 0)
  }

  private async selectService(serviceId: string): Promise<void> {
    this.createMode = false
    this.activeServiceId = serviceId
    await setActiveServiceId(serviceId)
    await this.reload()
  }

  private enterCreateMode(): void {
    this.createMode = true
    this.activeServiceId = null
    this.renderServiceList()
    this.applyDraftDetail()
    this.setDetailMode('create')
    this.setStatus('New service — fill in connection details and save.', 'idle')
  }

  private applyDraftDetail(): void {
    ;(this.querySelector('[data-ref="label"]') as HTMLInputElement).value = ''
    ;(this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = DEFAULT_CONFIG.baseUrl
    ;(this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value = ''
    ;(this.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value = ''
    ;(this.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked = true
    ;(this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = false
    this.setScriptKeyBadge(0)
    this.updateScriptKeyHint()
  }

  private applyServiceDetail(service: ServiceProfile, gmScope: string, scriptKeyRefCount: number): void {
    ;(this.querySelector('[data-ref="label"]') as HTMLInputElement).value = service.label
    ;(this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = service.baseUrl
    ;(this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value = service.scriptKey
    ;(this.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value = gmScope
    ;(this.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked = service.enabled
    ;(this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = service.developMode === true
    this.setScriptKeyBadge(scriptKeyRefCount)
    this.updateScriptKeyHint()
  }

  private setScriptKeyBadge(refCount: number): void {
    const badge = this.querySelector('[data-ref="scriptkey-badge"]') as HTMLElement | null
    if (!badge) {
      return
    }
    if (refCount > 1) {
      badge.textContent = 'Shared capability'
      return
    }
    badge.textContent = refCount === 1 ? 'Single endpoint' : ''
  }

  private setDetailMode(mode: DetailMode): void {
    const emptyEl = this.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
    const formEl = this.querySelector('[data-ref="detail-form"]') as HTMLElement | null
    emptyEl?.classList.toggle('hidden', mode !== 'empty')
    formEl?.classList.toggle('hidden', mode === 'empty')
    const canReorder = mode === 'edit' && Boolean(this.activeServiceId)
    for (const action of ['move-up', 'move-down', 'delete-service'] as const) {
      const btn = this.querySelector(`[data-action="${action}"]`) as HTMLButtonElement | null
      if (btn) {
        btn.disabled = !canReorder
      }
    }
  }

  private readFormInput(): {
    label: string
    baseUrl: string
    scriptKey: string
    gmScope: string
    enabled: boolean
    developMode: boolean
  } {
    return {
      label: (this.querySelector('[data-ref="label"]') as HTMLInputElement).value.trim(),
      baseUrl: (this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value.trim().replace(/\/$/, ''),
      scriptKey: (this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value.trim(),
      gmScope: (this.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value.trim(),
      enabled: (this.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked,
      developMode: (this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked,
    }
  }

  private validateFormInput(input: ReturnType<typeof this.readFormInput>): boolean {
    if (!input.baseUrl || !input.scriptKey) {
      this.setStatus('Please enter Server URL and Script Key.', 'error')
      return false
    }
    return true
  }

  private updateScriptKeyHint(): void {
    const hint = this.querySelector('[data-ref="script-key-hint"]') as HTMLElement | null
    const scriptKey = (this.querySelector('[data-ref="script-key"]') as HTMLInputElement).value.trim()
    if (!hint) {
      return
    }
    if (!scriptKey) {
      hint.textContent = 'Matches /static/[key]/'
      return
    }
    hint.textContent = isValidScriptKeyFormat(scriptKey) ? 'Valid script key format.' : 'Expected 64-character hex (SHA-256 of Gist id).'
  }

  private setStatus(text: string, variant: 'idle' | 'ok' | 'error' = 'idle'): void {
    const statusEl = this.querySelector('[data-ref="status"]') as HTMLElement | null
    if (!statusEl) {
      return
    }
    statusEl.textContent = text
    statusEl.className = variant === 'error' ? `${STATUS_BASE} text-mm-danger` : variant === 'ok' ? `${STATUS_BASE} text-mm-success` : STATUS_BASE
  }

  private setTestButtonState(state: 'idle' | 'loading' | 'ok' | 'error', message?: string): void {
    const btn = this.querySelector('[data-action="test"]') as HTMLButtonElement | null
    const label = this.querySelector('[data-ref="test-label"]') as HTMLElement | null
    const icon = this.querySelector('[data-ref="test-icon"]') as HTMLElement | null
    if (!btn || !label || !icon) {
      return
    }

    if (this.testButtonTimer) {
      clearTimeout(this.testButtonTimer)
      this.testButtonTimer = undefined
    }

    btn.classList.remove('is-ok', 'is-error')
    btn.disabled = state === 'loading'

    if (state === 'loading') {
      setIconSlotLoading(icon, true)
      label.textContent = 'Testing…'
      return
    }

    setIconSlotLoading(icon, false)

    if (state === 'idle') {
      label.textContent = 'Test'
      return
    }

    if (state === 'ok') {
      btn.classList.add('is-ok')
      label.textContent = message ?? 'OK'
      this.testButtonTimer = setTimeout(() => this.setTestButtonState('idle'), 2500)
      return
    }

    btn.classList.add('is-error')
    label.textContent = this.truncateTestLabel(message ?? 'Failed')
    this.testButtonTimer = setTimeout(() => this.setTestButtonState('idle'), 3000)
  }

  private truncateTestLabel(text: string, max = 28): string {
    const trimmed = text.trim()
    if (trimmed.length <= max) {
      return trimmed
    }
    return `${trimmed.slice(0, max - 1)}…`
  }

  private async testConnection(): Promise<void> {
    const input = this.readFormInput()
    if (!input.baseUrl || !input.scriptKey) {
      this.setTestButtonState('error', 'Missing fields')
      return
    }

    this.setTestButtonState('loading')
    try {
      const url = `${input.baseUrl}/api/tampermonkey/${encodeURIComponent(input.scriptKey)}/scripts/version`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        this.setTestButtonState('error', `HTTP ${res.status}`)
        return
      }
      const body = (await res.json()) as { code?: number; data?: { gistUpdatedAt?: number } }
      if (body.code !== 0 || typeof body.data?.gistUpdatedAt !== 'number') {
        this.setTestButtonState('error', 'Invalid response')
        return
      }
      this.setTestButtonState('ok', 'OK')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      this.setTestButtonState('error', message)
    }
  }

  private async save(): Promise<void> {
    const input = this.readFormInput()
    if (!this.validateFormInput(input)) {
      return
    }

    try {
      if (this.createMode) {
        const existingScriptKey = this.services.some((s) => s.scriptKey.trim() === input.scriptKey)
        const service = await createServiceFromOptions({
          label: input.label,
          baseUrl: input.baseUrl,
          scriptKey: input.scriptKey,
          enabled: input.enabled,
          developMode: input.developMode,
          gmScope: input.gmScope,
        })
        this.createMode = false
        this.activeServiceId = service.id
        this.setStatus(existingScriptKey ? 'Saved. This script key shares rules and script toggles with other services.' : 'Service created.', 'ok')
        await this.reload()
        return
      }

      if (!this.activeServiceId) {
        this.setStatus('Select a service to save.', 'error')
        return
      }

      const { endpointChanged } = await saveActiveServiceFromOptions({
        serviceId: this.activeServiceId,
        ...input,
      })
      const formatNote = isValidScriptKeyFormat(input.scriptKey) ? '' : ' Script key format looks unusual.'
      this.setStatus((endpointChanged ? 'Saved. Endpoint changed — reload open tabs.' : 'Saved. Reload open tabs for changes to take effect.') + formatNote, 'ok')
      await this.reload()
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Save failed.', 'error')
    }
  }

  private async reset(): Promise<void> {
    if (!window.confirm('Reset all services to defaults? This removes every connection.')) {
      return
    }
    this.createMode = false
    this.activeServiceId = null
    await resetOptionsServiceConfig()
    this.applyDraftDetail()
    await this.reload()
    this.setStatus('Reset to defaults.', 'ok')
  }

  private async moveActive(direction: 'up' | 'down'): Promise<void> {
    if (!this.activeServiceId) {
      return
    }
    await moveService(this.activeServiceId, direction)
    await this.reload()
    this.setStatus(direction === 'up' ? 'Moved up (OTA priority increased).' : 'Moved down (OTA priority decreased).', 'ok')
  }

  private async deleteActive(): Promise<void> {
    if (!this.activeServiceId) {
      return
    }
    if (!window.confirm('Delete this service? OTA cache for this endpoint will be cleared.')) {
      return
    }
    const id = this.activeServiceId
    this.activeServiceId = null
    await removeService(id)
    await this.reload()
    this.setStatus('Service deleted.', 'ok')
  }

  private shortScriptKey(scriptKey: string): string {
    const trimmed = scriptKey.trim()
    if (trimmed.length <= 12) {
      return trimmed || '—'
    }
    return `${trimmed.slice(0, 8)}…`
  }
}
