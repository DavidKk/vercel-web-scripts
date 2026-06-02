import { isValidScriptKeyFormat, resolveOtaEndpoint } from '@ext/shared/extension-services'
import {
  clearActiveServiceId,
  createServiceFromOptions,
  loadOptionsPanelDetail,
  removeService,
  reorderService,
  resetOptionsServiceConfig,
  saveActiveServiceFromOptions,
  setActiveServiceId,
} from '@ext/shared/extension-storage'
import { DEFAULT_CONFIG, type ServiceProfile, SERVICES_STORAGE_KEY } from '@ext/types'

import { hydrateMmIcons, setIconSlotKey, setIconSlotLoading } from './mm-icons'
import { initMmTooltipDelegation, updateMmTooltip } from './mm-tooltip'

const STATUS_BASE = 'mm-servers-status'

type DetailMode = 'empty' | 'edit' | 'create'
type ServiceTestState = 'idle' | 'loading' | 'ok' | 'error'

const DETAIL_TEST_TOOLTIPS: Record<ServiceTestState, string> = {
  idle: 'Test connection (optional)',
  loading: 'Testing connection…',
  ok: 'Connection OK',
  error: 'Connection failed',
}

/**
 * Options page controller — multi-service list + detail panel.
 */
export class MmOptionsApp extends HTMLElement {
  private bound = false
  private createMode = false
  private activeServiceId: string | null = null
  private services: ServiceProfile[] = []
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  private serviceTestTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private testAllRunning = false
  private detailTestTimer: ReturnType<typeof setTimeout> | undefined
  private dragServiceId: string | null = null
  private dropPlaceholderEl: HTMLElement | null = null
  private listDragBound = false

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    initMmTooltipDelegation(this)
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
    for (const timer of this.serviceTestTimers.values()) {
      clearTimeout(timer)
    }
    this.serviceTestTimers.clear()
    if (this.detailTestTimer) {
      clearTimeout(this.detailTestTimer)
      this.detailTestTimer = undefined
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
    this.querySelector('[data-action="test-all"]')?.addEventListener('click', () => {
      void this.runAllServiceTests()
    })
    this.querySelector('[data-action="add-service"]')?.addEventListener('click', () => {
      this.enterCreateMode()
    })
    this.querySelector('[data-ref="service-list"]')?.addEventListener('click', (event) => {
      const el = event.target as HTMLElement
      const testBtn = el.closest<HTMLElement>('[data-action="test-service"]')
      if (testBtn?.dataset.serviceId) {
        event.preventDefault()
        event.stopPropagation()
        void this.runServiceTest(testBtn.dataset.serviceId)
        return
      }
      const deleteBtn = el.closest<HTMLElement>('[data-action="delete-service-item"]')
      if (deleteBtn?.dataset.serviceId) {
        event.preventDefault()
        event.stopPropagation()
        void this.deleteServiceById(deleteBtn.dataset.serviceId)
      }
    })
    this.querySelector('[data-action="delete-service"]')?.addEventListener('click', () => {
      void this.deleteActive()
    })
    this.querySelector('[data-action="test-connection"]')?.addEventListener('click', () => {
      void this.runDetailConnectionTest()
    })

    const listEl = this.querySelector('[data-ref="service-list"]') as HTMLUListElement | null
    if (listEl) {
      this.bindListDragReorder(listEl)
    }

    this.querySelector('[data-ref="script-key"]')?.addEventListener('input', () => {
      this.updateScriptKeyHint()
    })
  }

  private async reload(options?: { preserveDraft?: boolean }): Promise<void> {
    const detail = await loadOptionsPanelDetail()
    this.services = detail.state.services
    if (!options?.preserveDraft) {
      this.createMode = false
      this.activeServiceId = detail.service?.id ?? null
    } else if (!this.createMode) {
      this.activeServiceId = detail.service?.id ?? null
    }
    this.renderServiceList()
    if (this.createMode) {
      this.setDetailMode('create')
      return
    }
    if (this.activeServiceId && detail.service) {
      this.applyServiceDetail(detail.service, detail.gmScope, detail.scriptKeyRefCount)
      this.setDetailMode('edit')
      return
    }
    this.activeServiceId = null
    this.setDetailMode('empty')
  }

  private renderServiceList(): void {
    const listEl = this.querySelector('[data-ref="service-list"]') as HTMLUListElement | null
    const emptyEl = this.querySelector('[data-ref="service-list-empty"]') as HTMLElement | null
    const scrollEl = this.querySelector('[data-ref="list-scroll"]') as HTMLElement | null
    if (!listEl || !emptyEl) {
      return
    }

    const hasServices = this.services.length > 0
    scrollEl?.classList.toggle('is-empty', !hasServices)
    listEl.classList.toggle('hidden', !hasServices)

    listEl.replaceChildren()
    const scriptKeyCounts = new Map<string, number>()
    for (const service of this.services) {
      const key = service.scriptKey.trim()
      scriptKeyCounts.set(key, (scriptKeyCounts.get(key) ?? 0) + 1)
    }

    for (const service of this.services) {
      const item = document.createElement('li')
      item.className = 'mm-options-service-row'
      item.dataset.serviceId = service.id

      const dragHandle = document.createElement('span')
      dragHandle.className = 'mm-servers-drag-handle'
      dragHandle.dataset.action = 'drag-handle'
      dragHandle.role = 'button'
      dragHandle.tabIndex = 0
      item.draggable = true
      dragHandle.setAttribute('data-mm-tooltip', 'Drag to reorder')
      dragHandle.setAttribute('data-mm-tooltip-placement', 'right')
      dragHandle.setAttribute('aria-label', 'Drag to reorder')
      const dragIcon = document.createElement('span')
      dragIcon.className = 'mm-icon-slot'
      dragIcon.dataset.icon = 'drag'
      dragHandle.appendChild(dragIcon)

      const card = document.createElement('div')
      card.className = 'mm-options-service-card'
      card.setAttribute('role', 'option')
      card.dataset.serviceId = service.id
      card.setAttribute('aria-selected', String(!this.createMode && service.id === this.activeServiceId))

      const body = document.createElement('button')
      body.type = 'button'
      body.className = 'mm-options-service-item-body'

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

      body.append(label, meta, badges)
      body.addEventListener('click', () => {
        if (!this.createMode && this.activeServiceId === service.id) {
          void this.deselectService()
          return
        }
        void this.selectService(service.id)
      })

      const testBtn = document.createElement('button')
      testBtn.type = 'button'
      testBtn.className = 'mm-servers-item-action'
      testBtn.dataset.action = 'test-service'
      testBtn.dataset.serviceId = service.id
      testBtn.setAttribute('data-mm-tooltip', 'Test connection')
      testBtn.setAttribute('aria-label', 'Test connection')
      const testIcon = document.createElement('span')
      testIcon.className = 'mm-icon-slot'
      testIcon.dataset.icon = 'test'
      testBtn.appendChild(testIcon)

      const deleteBtn = document.createElement('button')
      deleteBtn.type = 'button'
      deleteBtn.className = 'mm-servers-item-action'
      deleteBtn.dataset.action = 'delete-service-item'
      deleteBtn.dataset.serviceId = service.id
      deleteBtn.setAttribute('data-mm-tooltip', 'Delete service')
      deleteBtn.setAttribute('aria-label', 'Delete service')
      const deleteIcon = document.createElement('span')
      deleteIcon.className = 'mm-icon-slot'
      deleteIcon.dataset.icon = 'delete'
      deleteBtn.appendChild(deleteIcon)

      card.append(body, testBtn, deleteBtn)
      item.append(dragHandle, card)
      listEl.appendChild(item)
    }

    hydrateMmIcons(listEl)

    emptyEl.classList.toggle('hidden', hasServices)
  }

  private bindListDragReorder(listEl: HTMLUListElement): void {
    if (this.listDragBound) {
      return
    }
    this.listDragBound = true

    const clearDragUi = (): void => {
      listEl.classList.remove('is-list-dragging')
      listEl.querySelectorAll('.is-dragging').forEach((el) => {
        el.classList.remove('is-dragging')
      })
      this.removeDropPlaceholder()
      this.dragServiceId = null
    }

    listEl.addEventListener('dragstart', (event) => {
      const handle = (event.target as HTMLElement).closest('[data-action="drag-handle"]')
      if (!handle) {
        event.preventDefault()
        return
      }
      const row = handle.closest<HTMLElement>('.mm-options-service-row')
      const serviceId = row?.dataset.serviceId
      const card = row?.querySelector('.mm-options-service-card') as HTMLElement | null
      if (!serviceId || !row || !card) {
        event.preventDefault()
        return
      }
      this.dragServiceId = serviceId
      row.classList.add('is-dragging')
      listEl.classList.add('is-list-dragging')
      this.setRowDragImage(event, card)
      event.dataTransfer?.setData('text/plain', serviceId)
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
      }
    })

    listEl.addEventListener('dragend', () => {
      clearDragUi()
    })

    listEl.addEventListener('dragover', (event) => {
      if (!this.dragServiceId) {
        return
      }
      event.preventDefault()
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
      const afterRow = this.getDragAfterRow(listEl, event.clientY)
      this.placeDropPlaceholder(listEl, afterRow)
    })

    listEl.addEventListener('drop', (event) => {
      event.preventDefault()
      const draggedId = this.dragServiceId ?? event.dataTransfer?.getData('text/plain') ?? ''
      const insertAt = this.insertIndexFromDropPlaceholder(listEl, draggedId)
      clearDragUi()
      if (!draggedId || insertAt < 0) {
        return
      }
      void this.applyServiceReorder(draggedId, insertAt)
    })

    listEl.addEventListener('dragleave', (event) => {
      if (!this.dragServiceId) {
        return
      }
      const related = event.relatedTarget as Node | null
      if (related && listEl.contains(related)) {
        return
      }
      this.removeDropPlaceholder()
    })

    listEl.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-action="drag-handle"]')) {
        event.stopPropagation()
      }
    })
  }

  /** Floating card image while dragging (not the handle glyph). */
  private setRowDragImage(event: DragEvent, card: HTMLElement): void {
    if (!event.dataTransfer) {
      return
    }
    const rect = card.getBoundingClientRect()
    const clone = card.cloneNode(true) as HTMLElement
    clone.classList.add('mm-servers-drag-ghost')
    clone.style.width = `${rect.width}px`
    clone.style.position = 'fixed'
    clone.style.left = '-10000px'
    clone.style.top = '0'
    clone.style.pointerEvents = 'none'
    document.body.appendChild(clone)
    const offsetX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const offsetY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    event.dataTransfer.setDragImage(clone, offsetX, offsetY)
    requestAnimationFrame(() => {
      clone.remove()
    })
  }

  private ensureDropPlaceholder(): HTMLElement {
    if (!this.dropPlaceholderEl) {
      this.dropPlaceholderEl = document.createElement('li')
      this.dropPlaceholderEl.className = 'mm-servers-drop-placeholder'
      this.dropPlaceholderEl.setAttribute('aria-hidden', 'true')
    }
    return this.dropPlaceholderEl
  }

  private removeDropPlaceholder(): void {
    this.dropPlaceholderEl?.remove()
  }

  private placeDropPlaceholder(listEl: HTMLUListElement, beforeRow: HTMLElement | null): void {
    const placeholder = this.ensureDropPlaceholder()
    if (beforeRow === null) {
      listEl.appendChild(placeholder)
      return
    }
    if (beforeRow !== placeholder) {
      listEl.insertBefore(placeholder, beforeRow)
    }
  }

  private getDragAfterRow(listEl: HTMLUListElement, clientY: number): HTMLElement | null {
    const rows = [...listEl.querySelectorAll<HTMLElement>('.mm-options-service-row:not(.is-dragging)')]
    let closest: { offset: number; element: HTMLElement | null } = { offset: Number.NEGATIVE_INFINITY, element: null }

    for (const row of rows) {
      const box = row.getBoundingClientRect()
      const offset = clientY - box.top - box.height / 2
      if (offset < 0 && offset > closest.offset) {
        closest = { offset, element: row }
      }
    }

    return closest.element
  }

  private insertIndexFromDropPlaceholder(listEl: HTMLUListElement, draggedId: string): number {
    const placeholder = this.dropPlaceholderEl
    if (!placeholder?.parentElement) {
      return -1
    }

    let insertAt = 0
    for (const child of listEl.children) {
      if (child === placeholder) {
        break
      }
      if (child instanceof HTMLElement && child.classList.contains('mm-options-service-row') && child.dataset.serviceId !== draggedId) {
        insertAt += 1
      }
    }
    return insertAt
  }

  private async applyServiceReorder(serviceId: string, insertAt: number): Promise<void> {
    const fromIndex = this.services.findIndex((s) => s.id === serviceId)
    if (fromIndex < 0) {
      return
    }
    const clamped = Math.max(0, Math.min(insertAt, this.services.length - 1))
    if (fromIndex === clamped) {
      return
    }
    await reorderService(serviceId, clamped)
    this.setStatus('Order updated. Top row has highest OTA priority.', 'ok')
  }

  private async selectService(serviceId: string): Promise<void> {
    this.createMode = false
    this.activeServiceId = serviceId
    await setActiveServiceId(serviceId)
    await this.reload()
  }

  private async deselectService(): Promise<void> {
    this.createMode = false
    this.activeServiceId = null
    await clearActiveServiceId()
    this.renderServiceList()
    this.setDetailMode('empty')
    this.setStatus('', 'idle')
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
    const desc = this.querySelector('[data-ref="detail-pane-desc"]') as HTMLElement | null
    if (!desc || this.createMode) {
      return
    }
    if (refCount > 1) {
      desc.textContent = 'Shared capability layer with other services using this script key.'
      return
    }
    desc.textContent = refCount === 1 ? 'Single endpoint for this script key.' : ''
  }

  private setDetailMode(mode: DetailMode): void {
    const emptyEl = this.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
    const formEl = this.querySelector('[data-ref="detail-form"]') as HTMLElement | null
    const bodyEl = this.querySelector('[data-ref="detail-body"]') as HTMLElement | null
    emptyEl?.classList.toggle('hidden', mode !== 'empty')
    formEl?.classList.toggle('hidden', mode === 'empty')
    bodyEl?.classList.toggle('is-empty', mode === 'empty')
    this.setDetailPaneTitle(mode)
    const canDelete = mode === 'edit' && Boolean(this.activeServiceId)
    const deleteBtn = this.querySelector('[data-action="delete-service"]') as HTMLButtonElement | null
    if (deleteBtn) {
      deleteBtn.disabled = !canDelete
    }
    if (mode === 'empty') {
      this.setDetailTestState('idle')
    }
    const testConnBtn = this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
    if (testConnBtn) {
      testConnBtn.disabled = mode === 'empty' || this.testAllRunning
    }
  }

  private setDetailPaneTitle(mode: DetailMode): void {
    const titleEl = this.querySelector('[data-ref="detail-pane-title"]') as HTMLElement | null
    const descEl = this.querySelector('[data-ref="detail-pane-desc"]') as HTMLElement | null
    if (!titleEl) {
      return
    }

    if (mode === 'empty') {
      titleEl.textContent = 'Service'
      if (descEl) {
        descEl.textContent = 'Select a service from the list or add a new connection.'
      }
      return
    }

    if (mode === 'create') {
      titleEl.textContent = 'New service'
      if (descEl) {
        descEl.textContent = 'Draft — save to add this connection.'
      }
      return
    }

    titleEl.textContent = 'Edit service'
    if (descEl && !descEl.textContent) {
      descEl.textContent = 'Update connection details and save.'
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

  private getServiceTestButton(serviceId: string): HTMLButtonElement | null {
    return this.querySelector(`[data-action="test-service"][data-service-id="${CSS.escape(serviceId)}"]`)
  }

  private clearServiceTestTimer(serviceId: string): void {
    const timer = this.serviceTestTimers.get(serviceId)
    if (timer) {
      clearTimeout(timer)
      this.serviceTestTimers.delete(serviceId)
    }
  }

  private setServiceTestState(serviceId: string, state: ServiceTestState): void {
    const btn = this.getServiceTestButton(serviceId)
    const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
    if (!btn || !icon) {
      return
    }

    this.clearServiceTestTimer(serviceId)
    btn.classList.remove('is-ok', 'is-error')
    btn.disabled = state === 'loading' || this.testAllRunning

    if (state === 'loading') {
      setIconSlotLoading(icon, true)
      return
    }

    if (state === 'idle') {
      setIconSlotKey(icon, 'test')
      return
    }

    if (state === 'ok') {
      btn.classList.add('is-ok')
      setIconSlotKey(icon, 'check')
      this.serviceTestTimers.set(
        serviceId,
        setTimeout(() => this.setServiceTestState(serviceId, 'idle'), 2000)
      )
      return
    }

    btn.classList.add('is-error')
    setIconSlotKey(icon, 'close')
    this.serviceTestTimers.set(
      serviceId,
      setTimeout(() => this.setServiceTestState(serviceId, 'idle'), 2000)
    )
  }

  private setTestAllBusy(busy: boolean): void {
    const btn = this.querySelector('[data-action="test-all"]') as HTMLButtonElement | null
    const icon = this.querySelector('[data-ref="test-all-icon"]') as HTMLElement | null
    if (btn) {
      btn.disabled = busy
    }
    if (!icon) {
      return
    }
    if (busy) {
      setIconSlotLoading(icon, true)
      return
    }
    setIconSlotKey(icon, 'testAll')
  }

  private resolveTestEndpoint(serviceId: string): { baseUrl: string; scriptKey: string } | null {
    const service = this.services.find((s) => s.id === serviceId)
    if (!service) {
      return null
    }
    if (serviceId === this.activeServiceId) {
      const input = this.readFormInput()
      if (input.baseUrl && input.scriptKey) {
        return { baseUrl: input.baseUrl, scriptKey: input.scriptKey }
      }
    }
    const baseUrl = service.baseUrl.trim()
    const scriptKey = service.scriptKey.trim()
    if (!baseUrl || !scriptKey) {
      return null
    }
    return { baseUrl, scriptKey }
  }

  private async pingEndpoint(baseUrl: string, scriptKey: string): Promise<boolean> {
    const url = `${baseUrl}/api/tampermonkey/${encodeURIComponent(scriptKey)}/scripts/version`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) {
      return false
    }
    const body = (await res.json()) as { code?: number; data?: { gistUpdatedAt?: number } }
    return body.code === 0 && typeof body.data?.gistUpdatedAt === 'number'
  }

  private clearDetailTestTimer(): void {
    if (this.detailTestTimer) {
      clearTimeout(this.detailTestTimer)
      this.detailTestTimer = undefined
    }
  }

  private applyDetailTestTooltip(state: ServiceTestState): void {
    const btn = this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
    if (!btn) {
      return
    }
    const label = DETAIL_TEST_TOOLTIPS[state]
    updateMmTooltip(btn, label, 'bottom')
    btn.setAttribute('aria-label', label)
  }

  private setDetailTestState(state: ServiceTestState): void {
    const btn = this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
    const icon = this.querySelector('[data-ref="test-connection-icon"]') as HTMLElement | null
    if (!btn || !icon) {
      return
    }

    this.clearDetailTestTimer()
    btn.classList.remove('is-ok', 'is-error')
    btn.disabled = state === 'loading' || this.testAllRunning
    this.applyDetailTestTooltip(state)

    if (state === 'loading') {
      setIconSlotLoading(icon, true)
      return
    }

    if (state === 'idle') {
      setIconSlotKey(icon, 'test')
      if (!this.testAllRunning) {
        btn.disabled = false
      }
      return
    }

    if (state === 'ok') {
      btn.classList.add('is-ok')
      setIconSlotKey(icon, 'check')
      this.detailTestTimer = setTimeout(() => this.setDetailTestState('idle'), 2000)
      return
    }

    btn.classList.add('is-error')
    setIconSlotKey(icon, 'close')
    this.detailTestTimer = setTimeout(() => this.setDetailTestState('idle'), 2000)
  }

  private async runDetailConnectionTest(): Promise<void> {
    const input = this.readFormInput()
    if (!input.baseUrl || !input.scriptKey) {
      this.setStatus('Enter Server URL and Script Key to test.', 'error')
      this.setDetailTestState('error')
      return
    }

    const icon = this.querySelector('[data-ref="test-connection-icon"]') as HTMLElement | null
    if (icon?.classList.contains('mm-icon-spin')) {
      return
    }

    this.setDetailTestState('loading')
    this.setStatus('Testing connection…', 'idle')
    try {
      const ok = await this.pingEndpoint(input.baseUrl, input.scriptKey)
      this.setDetailTestState(ok ? 'ok' : 'error')
      this.setStatus(ok ? 'Connection OK.' : 'Could not reach server. Check URL and script key.', ok ? 'ok' : 'error')
      if (this.activeServiceId) {
        this.setServiceTestState(this.activeServiceId, ok ? 'ok' : 'error')
      }
    } catch {
      this.setDetailTestState('error')
      this.setStatus('Could not reach server. Check URL and script key.', 'error')
      if (this.activeServiceId) {
        this.setServiceTestState(this.activeServiceId, 'error')
      }
    }
  }

  private async runServiceTest(serviceId: string): Promise<boolean> {
    const icon = this.getServiceTestButton(serviceId)?.querySelector('.mm-icon-slot') as HTMLElement | null
    if (icon?.classList.contains('mm-icon-spin')) {
      return false
    }

    const endpoint = this.resolveTestEndpoint(serviceId)
    if (!endpoint) {
      this.setServiceTestState(serviceId, 'error')
      return false
    }

    this.setServiceTestState(serviceId, 'loading')
    try {
      const ok = await this.pingEndpoint(endpoint.baseUrl, endpoint.scriptKey)
      this.setServiceTestState(serviceId, ok ? 'ok' : 'error')
      return ok
    } catch {
      this.setServiceTestState(serviceId, 'error')
      return false
    }
  }

  private async runAllServiceTests(): Promise<void> {
    if (this.testAllRunning || this.services.length === 0) {
      return
    }

    this.testAllRunning = true
    this.setTestAllBusy(true)
    const detailTestBtn = this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
    if (detailTestBtn) {
      detailTestBtn.disabled = true
    }

    let passed = 0
    for (const service of this.services) {
      const ok = await this.runServiceTest(service.id)
      if (ok) {
        passed += 1
      }
    }

    this.testAllRunning = false
    this.setTestAllBusy(false)
    if (detailTestBtn) {
      detailTestBtn.disabled = false
    }
    for (const btn of this.querySelectorAll<HTMLButtonElement>('[data-action="test-service"]')) {
      if (!btn.querySelector('.mm-icon-slot')?.classList.contains('mm-icon-spin')) {
        btn.disabled = false
      }
    }

    const total = this.services.length
    if (passed === total) {
      this.setStatus(`All ${total} connection(s) OK.`, 'ok')
      return
    }
    this.setStatus(`${passed}/${total} connection(s) OK.`, passed > 0 ? 'idle' : 'error')
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

  private confirmDeleteService(service: ServiceProfile): boolean {
    const name = service.label.trim() || service.baseUrl
    return window.confirm(
      `Delete “${name}”?\n\n${service.baseUrl} · ${this.shortScriptKey(service.scriptKey)}\n\nOTA cache for this endpoint will be cleared. This cannot be undone.`
    )
  }

  private async deleteServiceById(serviceId: string): Promise<void> {
    const service = this.services.find((entry) => entry.id === serviceId)
    if (!service) {
      return
    }
    if (!this.confirmDeleteService(service)) {
      return
    }
    if (this.activeServiceId === serviceId) {
      this.activeServiceId = null
      this.createMode = false
    }
    await removeService(serviceId)
    await this.reload()
    this.setStatus('Service deleted.', 'ok')
  }

  private async deleteActive(): Promise<void> {
    if (!this.activeServiceId) {
      return
    }
    await this.deleteServiceById(this.activeServiceId)
  }

  private shortScriptKey(scriptKey: string): string {
    const trimmed = scriptKey.trim()
    if (trimmed.length <= 12) {
      return trimmed || '—'
    }
    return `${trimmed.slice(0, 8)}…`
  }
}
