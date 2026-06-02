import {
  defaultDevelopModeForBaseUrl,
  defaultLabelFromBaseUrl,
  formatScriptKeyMasked,
  formatScriptKeyShort,
  getGmScopeForScriptKey,
  isValidScriptKeyFormat,
  resolveOtaEndpoint,
} from '@ext/shared/extension-services'
import {
  clearActiveServiceId,
  createServiceFromOptions,
  loadOptionsPanelDetail,
  removeService,
  reorderService,
  saveActiveServiceFromOptions,
  setActiveServiceId,
  setServiceEnabled,
} from '@ext/shared/extension-storage'
import { DEFAULT_CONFIG, type ScriptKeyMeta, type ServiceProfile, SERVICES_STORAGE_KEY } from '@ext/types'

import { subscribeAdminViewActivated } from './mm-admin-view-lifecycle'
import { hydrateMmIcons, setIconSlotKey, setIconSlotLoading } from './mm-icons'
import { showMmNotification } from './mm-notification'
import { initMmTooltipDelegation, updateMmTooltip } from './mm-tooltip'

const STATUS_BASE = 'mm-servers-status'

type DetailMode = 'empty' | 'edit' | 'create'
type ServiceTestState = 'idle' | 'loading' | 'ok' | 'error'

type DetailFieldRef = 'base-url' | 'script-key'

type DetailFormBaseline = {
  mode: DetailMode
  serviceId: string | null
  label: string
  baseUrl: string
  scriptKey: string
  gmScope: string
  enabled: boolean
  developMode: boolean
}

const SERVICE_TEST_OK_DISPLAY_MS = 3000
const SERVICE_TEST_RESULT_FADE_MS = 200

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
  private testAllRunning = false
  private serviceTestTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private batchTestDismissTimer: ReturnType<typeof setTimeout> | undefined
  private detailTestTimer: ReturnType<typeof setTimeout> | undefined
  private dragServiceId: string | null = null
  /** Set on drag-handle mousedown; cleared on mouseup/dragend. Gates row dragstart. */
  private listDragRowId: string | null = null
  private dropPlaceholderEl: HTMLElement | null = null
  private scriptKeyRefCount = 0
  private scriptKeyStored = ''
  private scriptKeyRevealed = true
  private scriptKeyMeta: ScriptKeyMeta[] = []
  private gmScopeTouched = false
  private labelTouched = false
  private developModeTouched = false
  private listDragBound = false
  private detailFormBaseline: DetailFormBaseline | null = null
  private unsubscribeAdminView: (() => void) | undefined

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    initMmTooltipDelegation(this)
    this.bindEvents()
    this.unsubscribeAdminView = subscribeAdminViewActivated('servers', () => {
      void this.reload({ preserveDraft: this.createMode })
    })

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
    this.clearBatchTestDismissTimer()
    if (this.detailTestTimer) {
      clearTimeout(this.detailTestTimer)
      this.detailTestTimer = undefined
    }
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener)
      this.storageListener = undefined
    }
    this.unsubscribeAdminView?.()
    this.unsubscribeAdminView = undefined
  }

  private bindEvents(): void {
    this.querySelector('[data-action="save"]')?.addEventListener('click', () => {
      void this.save()
    })
    this.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
      void this.resetDetailForm()
    })
    this.querySelector('[data-action="test-all"]')?.addEventListener('click', () => {
      void this.runAllServiceTests()
    })
    this.querySelector('[data-action="add-service"]')?.addEventListener('click', () => {
      if (!this.confirmDiscardDetailChanges()) {
        return
      }
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
        return
      }
      const enableBtn = el.closest<HTMLElement>('[data-action="toggle-service-enabled"]')
      if (enableBtn?.dataset.serviceId) {
        event.preventDefault()
        event.stopPropagation()
        const service = this.services.find((s) => s.id === enableBtn.dataset.serviceId)
        if (service) {
          void this.setServiceEnabledFromList(service.id, !service.enabled)
        }
      }
    })
    this.querySelector('[data-action="delete-service"]')?.addEventListener('click', () => {
      void this.deleteActive()
    })
    this.querySelector('[data-action="test-connection"]')?.addEventListener('click', () => {
      void this.runDetailConnectionTest()
    })
    this.querySelector('[data-action="toggle-script-key"]')?.addEventListener('click', () => {
      this.toggleScriptKeyVisibility()
    })

    const listEl = this.querySelector('[data-ref="service-list"]') as HTMLUListElement | null
    if (listEl) {
      this.bindListDragReorder(listEl)
    }

    this.querySelector('[data-ref="script-key"]')?.addEventListener('input', () => {
      this.clearFieldError('script-key')
      if (!this.shouldMaskScriptKey()) {
        this.scriptKeyStored = this.getScriptKeyInput()?.value ?? ''
      }
      this.updateScriptKeyHint()
      this.updateSuggestedServiceFields()
    })
    this.querySelector('[data-ref="base-url"]')?.addEventListener('input', () => {
      this.clearFieldError('base-url')
      this.updateSuggestedServiceFields()
    })
    this.querySelector('[data-ref="label"]')?.addEventListener('input', () => {
      this.labelTouched = true
      this.updateSuggestedServiceFields()
    })
    this.querySelector('[data-ref="gm-scope"]')?.addEventListener('input', () => {
      this.gmScopeTouched = true
    })
    this.querySelector('[data-ref="develop-mode"]')?.addEventListener('change', () => {
      this.developModeTouched = true
    })
  }

  private async reload(options?: { preserveDraft?: boolean }): Promise<void> {
    const detail = await loadOptionsPanelDetail()
    this.services = detail.state.services
    this.scriptKeyMeta = detail.state.scriptKeyMeta
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
      item.draggable = true

      const dragHandle = document.createElement('span')
      dragHandle.className = 'mm-servers-drag-handle'
      dragHandle.dataset.action = 'drag-handle'
      dragHandle.setAttribute('data-mm-tooltip', 'Drag to reorder')
      dragHandle.setAttribute('data-mm-tooltip-placement', 'right')
      dragHandle.setAttribute('aria-label', 'Drag to reorder')
      dragHandle.addEventListener('mousedown', (event) => {
        if (event.button !== 0) {
          return
        }
        this.listDragRowId = service.id
        const releaseGate = (): void => {
          window.removeEventListener('mouseup', releaseGate)
          window.setTimeout(() => {
            if (!this.dragServiceId) {
              this.listDragRowId = null
            }
          }, 0)
        }
        window.addEventListener('mouseup', releaseGate, { once: true })
      })
      const dragIcon = document.createElement('span')
      dragIcon.className = 'mm-icon-slot'
      dragIcon.dataset.icon = 'drag'
      dragHandle.appendChild(dragIcon)

      const card = document.createElement('div')
      card.className = `mm-options-service-card${service.enabled ? '' : ' is-service-off'}`
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
      meta.textContent = `${service.baseUrl} · ${formatScriptKeyShort(service.scriptKey)}`

      const badges = document.createElement('span')
      badges.className = 'mm-options-service-item-badges'

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
          if (!this.confirmDiscardDetailChanges()) {
            return
          }
          void this.deselectService()
          return
        }
        if (!this.confirmDiscardDetailChanges()) {
          return
        }
        void this.selectService(service.id)
      })

      const enableBtn = document.createElement('button')
      enableBtn.type = 'button'
      enableBtn.className = `mm-servers-item-action${service.enabled ? ' is-service-on' : ' is-service-off'}`
      enableBtn.dataset.action = 'toggle-service-enabled'
      enableBtn.dataset.serviceId = service.id
      enableBtn.setAttribute('aria-pressed', String(service.enabled))
      enableBtn.setAttribute('data-mm-tooltip', service.enabled ? 'Disable service (skipped for OTA)' : 'Enable service')
      enableBtn.setAttribute('aria-label', service.enabled ? 'Disable service' : 'Enable service')
      const enableIcon = document.createElement('span')
      enableIcon.className = 'mm-icon-slot'
      enableIcon.dataset.icon = service.enabled ? 'serviceOn' : 'serviceOff'
      enableBtn.appendChild(enableIcon)

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

      card.append(body, enableBtn, testBtn, deleteBtn)
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
      this.listDragRowId = null
    }

    listEl.addEventListener('dragstart', (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('.mm-options-service-row')
      const serviceId = row?.dataset.serviceId
      if (!serviceId || this.listDragRowId !== serviceId) {
        event.preventDefault()
        return
      }
      const card = row.querySelector('.mm-options-service-card') as HTMLElement | null
      if (!row || !card) {
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
    const detail = await loadOptionsPanelDetail()
    this.services = detail.state.services
    this.renderServiceList()
    this.setStatus('Order updated. Top row has highest OTA priority.', 'ok')
  }

  private async setServiceEnabledFromList(serviceId: string, enabled: boolean): Promise<void> {
    const previous = this.services.find((s) => s.id === serviceId)?.enabled
    if (previous === enabled) {
      return
    }
    await setServiceEnabled(serviceId, enabled)
    const detail = await loadOptionsPanelDetail()
    this.services = detail.state.services
    if (!this.createMode && this.activeServiceId === serviceId && detail.service) {
      this.applyServiceDetail(detail.service, detail.gmScope, detail.scriptKeyRefCount, { preserveTestUi: true })
    }
    this.renderServiceList()
    this.setStatus(enabled ? 'Service enabled.' : 'Service disabled (skipped for OTA).', 'ok')
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
    this.clearAllFieldErrors()
    this.setDetailTestState('idle')
    this.labelTouched = false
    this.gmScopeTouched = false
    this.developModeTouched = false
    ;(this.querySelector('[data-ref="label"]') as HTMLInputElement).value = ''
    ;(this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = DEFAULT_CONFIG.baseUrl
    this.scriptKeyStored = ''
    this.scriptKeyRevealed = true
    ;(this.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked = true
    ;(this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = defaultDevelopModeForBaseUrl(DEFAULT_CONFIG.baseUrl)
    this.setScriptKeyBadge(0)
    this.updateSuggestedServiceFields()
    this.syncScriptKeyFieldDisplay()
    this.updateScriptKeyHint()
    this.captureDetailFormBaseline()
  }

  private applyServiceDetail(service: ServiceProfile, gmScope: string, scriptKeyRefCount: number, options?: { preserveTestUi?: boolean }): void {
    this.clearAllFieldErrors()
    if (!options?.preserveTestUi) {
      this.setDetailTestState('idle')
    }
    this.labelTouched = false
    this.gmScopeTouched = false
    this.developModeTouched = false
    ;(this.querySelector('[data-ref="label"]') as HTMLInputElement).value = service.label
    ;(this.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = service.baseUrl
    this.scriptKeyStored = service.scriptKey
    this.scriptKeyRevealed = false
    ;(this.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value = gmScope
    ;(this.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked = service.enabled
    ;(this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = defaultDevelopModeForBaseUrl(service.baseUrl)
    this.setScriptKeyBadge(scriptKeyRefCount)
    this.syncScriptKeyFieldDisplay()
    this.updateScriptKeyHint()
    this.captureDetailFormBaseline()
  }

  private updateSuggestedServiceFields(): void {
    const labelEl = this.querySelector('[data-ref="label"]') as HTMLInputElement | null
    const baseUrlEl = this.querySelector('[data-ref="base-url"]') as HTMLInputElement | null
    const gmScopeEl = this.querySelector('[data-ref="gm-scope"]') as HTMLInputElement | null
    if (!labelEl || !baseUrlEl || !gmScopeEl) {
      return
    }

    const baseUrl = baseUrlEl.value.trim().replace(/\/$/, '')
    if (!this.labelTouched && !labelEl.value.trim() && baseUrl) {
      labelEl.value = defaultLabelFromBaseUrl(baseUrl)
    }

    if (this.gmScopeTouched) {
      return
    }

    const scriptKey = this.readScriptKeyValue()
    if (!scriptKey) {
      gmScopeEl.value = ''
      return
    }

    gmScopeEl.value = getGmScopeForScriptKey(scriptKey, this.scriptKeyMeta, labelEl.value, baseUrl)
    this.syncDevelopModeDefaultFromBaseUrl()
  }

  /** Keep Extension auto-reload aligned with the service Server URL until the user toggles it. */
  private syncDevelopModeDefaultFromBaseUrl(): void {
    if (this.developModeTouched) {
      return
    }
    const baseUrlEl = this.querySelector('[data-ref="base-url"]') as HTMLInputElement | null
    const developEl = this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement | null
    if (!baseUrlEl || !developEl) {
      return
    }
    const baseUrl = baseUrlEl.value.trim().replace(/\/$/, '')
    developEl.checked = baseUrl ? defaultDevelopModeForBaseUrl(baseUrl) : false
  }

  private setScriptKeyBadge(refCount: number): void {
    this.scriptKeyRefCount = refCount
    this.updateScriptKeyHint()
  }

  private setDetailMode(mode: DetailMode): void {
    const emptyEl = this.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
    const formEl = this.querySelector('[data-ref="detail-form"]') as HTMLElement | null
    const bodyEl = this.querySelector('[data-ref="detail-body"]') as HTMLElement | null
    emptyEl?.classList.toggle('hidden', mode !== 'empty')
    formEl?.classList.toggle('hidden', mode === 'empty')
    bodyEl?.classList.toggle('is-empty', mode === 'empty')
    const canDelete = mode === 'edit' && Boolean(this.activeServiceId)
    const deleteBtn = this.querySelector('[data-action="delete-service"]') as HTMLButtonElement | null
    if (deleteBtn) {
      deleteBtn.disabled = !canDelete
    }
    if (mode === 'empty') {
      this.setDetailTestState('idle')
      this.detailFormBaseline = null
      this.clearAllFieldErrors()
    }
    const testConnBtn = this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
    if (testConnBtn) {
      testConnBtn.disabled = mode === 'empty' || this.testAllRunning
    }
    if (mode === 'create') {
      this.scriptKeyRevealed = true
    } else if (mode === 'empty') {
      this.scriptKeyStored = ''
      this.scriptKeyRevealed = false
    }
    this.syncScriptKeyFieldDisplay()
    if (mode !== 'empty') {
      this.captureDetailFormBaseline()
    }
  }

  private getScriptKeyInput(): HTMLInputElement | null {
    return this.querySelector('[data-ref="script-key"]') as HTMLInputElement | null
  }

  private shouldMaskScriptKey(): boolean {
    return !this.createMode && !this.scriptKeyRevealed
  }

  private syncScriptKeyFieldDisplay(): void {
    const input = this.getScriptKeyInput()
    const toggleBtn = this.querySelector('[data-action="toggle-script-key"]') as HTMLButtonElement | null
    if (!input) {
      return
    }

    const showToggle = !this.createMode
    toggleBtn?.classList.toggle('hidden', !showToggle)

    if (this.shouldMaskScriptKey()) {
      input.readOnly = true
      input.value = formatScriptKeyMasked(this.scriptKeyStored)
    } else {
      input.readOnly = false
      input.value = this.scriptKeyStored
    }

    this.updateScriptKeyVisibilityUi()
  }

  private updateScriptKeyVisibilityUi(): void {
    const icon = this.querySelector('[data-ref="script-key-visibility-icon"]') as HTMLElement | null
    const btn = this.querySelector('[data-action="toggle-script-key"]') as HTMLButtonElement | null
    if (!icon || !btn || btn.classList.contains('hidden')) {
      return
    }

    const tooltip = this.scriptKeyRevealed ? 'Hide script key' : 'Show script key'
    if (this.scriptKeyRevealed) {
      setIconSlotKey(icon, 'eyeOff')
      btn.setAttribute('aria-label', tooltip)
      btn.setAttribute('data-mm-tooltip', tooltip)
    } else {
      setIconSlotKey(icon, 'eye')
      btn.setAttribute('aria-label', tooltip)
      btn.setAttribute('data-mm-tooltip', tooltip)
    }
    updateMmTooltip(btn, tooltip)
  }

  private toggleScriptKeyVisibility(): void {
    if (this.createMode) {
      return
    }
    if (this.scriptKeyRevealed) {
      this.scriptKeyStored = (this.getScriptKeyInput()?.value ?? '').trim()
      this.scriptKeyRevealed = false
    } else {
      this.scriptKeyRevealed = true
    }
    this.syncScriptKeyFieldDisplay()
    this.updateSuggestedServiceFields()
    if (this.scriptKeyRevealed) {
      const input = this.getScriptKeyInput()
      input?.focus()
      input?.setSelectionRange(input.value.length, input.value.length)
    }
  }

  private readScriptKeyValue(): string {
    if (this.shouldMaskScriptKey()) {
      return this.scriptKeyStored.trim()
    }
    return (this.getScriptKeyInput()?.value ?? '').trim()
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
      scriptKey: this.readScriptKeyValue(),
      gmScope: (this.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value.trim(),
      enabled: (this.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked,
      developMode: (this.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked,
    }
  }

  private validateFormInput(input: ReturnType<typeof this.readFormInput>): boolean {
    return this.validateRequiredDetailFields(input)
  }

  private getDetailFieldControl(ref: DetailFieldRef): HTMLInputElement | null {
    return this.querySelector(`[data-ref="${ref}"]`) as HTMLInputElement | null
  }

  private getDetailFieldRoot(ref: DetailFieldRef): HTMLElement | null {
    const input = this.getDetailFieldControl(ref)
    if (!input) {
      return null
    }
    return input.closest('mm-field')
  }

  private clearFieldError(ref: DetailFieldRef): void {
    const root = this.getDetailFieldRoot(ref)
    root?.classList.remove('is-invalid')
    const errorEl = this.querySelector(`[data-ref="${ref}-error"]`) as HTMLElement | null
    if (errorEl) {
      errorEl.textContent = ''
      errorEl.hidden = true
    }
    const input = this.getDetailFieldControl(ref)
    input?.removeAttribute('aria-invalid')
  }

  private clearAllFieldErrors(): void {
    for (const ref of ['base-url', 'script-key'] as const) {
      this.clearFieldError(ref)
    }
  }

  private setFieldError(ref: DetailFieldRef, message: string): void {
    const root = this.getDetailFieldRoot(ref)
    const errorEl = this.querySelector(`[data-ref="${ref}-error"]`) as HTMLElement | null
    const input = this.getDetailFieldControl(ref)
    root?.classList.add('is-invalid')
    if (errorEl) {
      errorEl.textContent = message
      errorEl.hidden = false
    }
    input?.setAttribute('aria-invalid', 'true')
  }

  private focusDetailField(ref: DetailFieldRef): void {
    if (ref === 'script-key' && this.shouldMaskScriptKey()) {
      this.scriptKeyRevealed = true
      this.syncScriptKeyFieldDisplay()
    }
    const input = this.getDetailFieldControl(ref)
    if (!input) {
      return
    }
    input.focus()
    if (typeof input.select === 'function') {
      input.select()
    }
    this.getDetailFieldRoot(ref)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  private validateRequiredDetailFields(input: ReturnType<typeof this.readFormInput>): boolean {
    this.clearAllFieldErrors()
    const errors: Array<{ ref: DetailFieldRef; message: string }> = []
    if (!input.baseUrl) {
      errors.push({ ref: 'base-url', message: 'Please enter Server URL.' })
    }
    if (!input.scriptKey) {
      errors.push({ ref: 'script-key', message: 'Please enter Script Key.' })
    }
    for (const error of errors) {
      this.setFieldError(error.ref, error.message)
    }
    if (errors.length > 0) {
      this.setStatus('', 'idle')
      this.focusDetailField(errors[0].ref)
      return false
    }
    return true
  }

  private currentDetailMode(): DetailMode {
    const emptyEl = this.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
    if (emptyEl && !emptyEl.classList.contains('hidden')) {
      return 'empty'
    }
    return this.createMode ? 'create' : 'edit'
  }

  private captureDetailFormBaseline(): void {
    const mode = this.currentDetailMode()
    if (mode === 'empty') {
      this.detailFormBaseline = null
      return
    }
    const input = this.readFormInput()
    this.detailFormBaseline = {
      mode,
      serviceId: this.activeServiceId,
      ...input,
    }
  }

  private hasUnsavedDetailChanges(): boolean {
    const mode = this.currentDetailMode()
    if (mode === 'empty') {
      return false
    }
    if (!this.detailFormBaseline) {
      return mode === 'create'
    }
    if (this.detailFormBaseline.mode !== mode || this.detailFormBaseline.serviceId !== this.activeServiceId) {
      return true
    }
    const input = this.readFormInput()
    return (
      input.label !== this.detailFormBaseline.label ||
      input.baseUrl !== this.detailFormBaseline.baseUrl ||
      input.scriptKey !== this.detailFormBaseline.scriptKey ||
      input.gmScope !== this.detailFormBaseline.gmScope ||
      input.enabled !== this.detailFormBaseline.enabled ||
      input.developMode !== this.detailFormBaseline.developMode
    )
  }

  /** Prompt when leaving Servers detail with unsaved edits (admin tab router). */
  confirmDiscardDetailChanges(): boolean {
    if (!this.hasUnsavedDetailChanges()) {
      return true
    }
    return window.confirm('Discard unsaved changes to this service?')
  }

  private updateScriptKeyHint(): void {
    const hint = this.querySelector('[data-ref="script-key-hint"]') as HTMLElement | null
    const scriptKey = this.readScriptKeyValue()
    if (!hint) {
      return
    }
    if (!this.createMode && this.scriptKeyRefCount > 1) {
      hint.textContent = 'Shared capability layer with other services using this script key.'
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

  private getServiceRow(serviceId: string): HTMLElement | null {
    return this.querySelector(`[data-ref="service-list"] .mm-options-service-row[data-service-id="${CSS.escape(serviceId)}"]`)
  }

  private getServiceCard(serviceId: string): HTMLElement | null {
    return this.getServiceRow(serviceId)?.querySelector('.mm-options-service-card') ?? null
  }

  private setTestAllListActive(active: boolean): void {
    this.querySelector('[data-ref="service-list"]')?.classList.toggle('is-test-all-active', active)
  }

  private clearServiceTestFail(serviceId: string): void {
    this.getServiceCard(serviceId)?.classList.remove('is-test-fail')
  }

  private clearServiceTestTimer(serviceId: string): void {
    const timer = this.serviceTestTimers.get(serviceId)
    if (timer) {
      clearTimeout(timer)
      this.serviceTestTimers.delete(serviceId)
    }
  }

  private clearServiceTestFeedbackUi(serviceId: string): void {
    const card = this.getServiceCard(serviceId)
    card?.classList.remove('is-test-feedback', 'is-test-feedback-exit')
  }

  /** After success: fade all row actions together → swap test icon while hidden. */
  private beginServiceTestOkDismiss(serviceId: string): void {
    const btn = this.getServiceTestButton(serviceId)
    const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
    const card = this.getServiceCard(serviceId)
    if (!btn || !icon) {
      this.setServiceTestState(serviceId, 'idle')
      return
    }

    card?.classList.add('is-test-feedback-exit')
    this.serviceTestTimers.set(
      serviceId,
      setTimeout(() => {
        btn.classList.remove('is-ok')
        setIconSlotKey(icon, 'test')
        card?.classList.remove('is-test-feedback', 'is-test-feedback-exit')
        if (!this.testAllRunning) {
          btn.disabled = false
        }
        this.serviceTestTimers.delete(serviceId)
      }, SERVICE_TEST_RESULT_FADE_MS)
    )
  }

  private scheduleServiceTestOkDismiss(serviceId: string): void {
    this.clearServiceTestTimer(serviceId)
    this.serviceTestTimers.set(
      serviceId,
      setTimeout(() => this.beginServiceTestOkDismiss(serviceId), SERVICE_TEST_OK_DISPLAY_MS)
    )
  }

  private clearBatchTestDismissTimer(): void {
    if (this.batchTestDismissTimer) {
      clearTimeout(this.batchTestDismissTimer)
      this.batchTestDismissTimer = undefined
    }
  }

  /** Test-all: wait once, then fade every successful row's actions in sync. */
  private scheduleBatchOkDismiss(serviceIds: string[]): void {
    this.clearBatchTestDismissTimer()
    if (serviceIds.length === 0) {
      return
    }
    this.batchTestDismissTimer = setTimeout(() => {
      this.batchTestDismissTimer = undefined
      this.beginBatchOkDismiss(serviceIds)
    }, SERVICE_TEST_OK_DISPLAY_MS)
  }

  private beginBatchOkDismiss(serviceIds: string[]): void {
    for (const serviceId of serviceIds) {
      this.getServiceCard(serviceId)?.classList.add('is-test-feedback-exit')
    }

    setTimeout(() => {
      for (const serviceId of serviceIds) {
        const btn = this.getServiceTestButton(serviceId)
        const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
        btn?.classList.remove('is-ok')
        if (icon) {
          setIconSlotKey(icon, 'test')
        }
        if (btn) {
          btn.disabled = false
        }
        this.clearServiceTestFeedbackUi(serviceId)
      }
    }, SERVICE_TEST_RESULT_FADE_MS)
  }

  private setServiceTestState(serviceId: string, state: ServiceTestState): void {
    const btn = this.getServiceTestButton(serviceId)
    const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
    const card = this.getServiceCard(serviceId)

    if (state === 'loading') {
      this.clearServiceTestTimer(serviceId)
      this.clearServiceTestFeedbackUi(serviceId)
      if (btn) {
        btn.classList.remove('is-ok', 'is-error')
        btn.disabled = true
      }
      if (icon) {
        setIconSlotLoading(icon, true)
      }
      card?.classList.add('is-test-feedback')
      return
    }

    if (state === 'ok') {
      this.clearServiceTestTimer(serviceId)
      this.clearServiceTestFeedbackUi(serviceId)
      if (btn) {
        btn.classList.remove('is-error')
        btn.classList.add('is-ok')
        btn.disabled = this.testAllRunning
      }
      if (icon) {
        setIconSlotKey(icon, 'check')
      }
      this.clearServiceTestFail(serviceId)
      card?.classList.add('is-test-feedback')
      if (!this.testAllRunning) {
        this.scheduleServiceTestOkDismiss(serviceId)
      }
      return
    }

    if (state === 'error') {
      this.clearServiceTestTimer(serviceId)
      card?.classList.remove('is-test-feedback-exit')
      if (btn) {
        btn.classList.remove('is-ok')
        btn.classList.add('is-error')
        btn.disabled = this.testAllRunning
      }
      if (icon) {
        setIconSlotKey(icon, 'close')
      }
      card?.classList.add('is-test-fail', 'is-test-feedback')
      return
    }

    if (state === 'idle') {
      this.clearServiceTestTimer(serviceId)
      this.clearServiceTestFeedbackUi(serviceId)
      if (btn) {
        btn.classList.remove('is-ok', 'is-error')
        btn.disabled = this.testAllRunning
      }
      if (icon) {
        setIconSlotKey(icon, 'test')
      }
      this.clearServiceTestFail(serviceId)
    }
  }

  private finishBatchServiceTestButtons(serviceIds: string[]): void {
    for (const serviceId of serviceIds) {
      const btn = this.getServiceTestButton(serviceId)
      if (btn) {
        btn.disabled = false
      }
    }
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

  private getDetailTestButton(): HTMLButtonElement | null {
    return this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
  }

  private getDetailTestIcon(): HTMLElement | null {
    return this.querySelector('[data-ref="test-connection-icon"]') as HTMLElement | null
  }

  private clearDetailTestFeedbackUi(): void {
    this.getDetailTestButton()?.classList.remove('is-test-feedback-exit')
  }

  private beginDetailTestOkDismiss(): void {
    const btn = this.getDetailTestButton()
    const icon = this.getDetailTestIcon()
    if (!btn || !icon) {
      this.setDetailTestState('idle')
      return
    }

    btn.classList.add('is-test-feedback-exit')
    this.detailTestTimer = setTimeout(() => {
      btn.classList.remove('is-ok', 'is-test-feedback-exit')
      setIconSlotKey(icon, 'test')
      if (!this.testAllRunning) {
        btn.disabled = false
      }
      this.detailTestTimer = undefined
    }, SERVICE_TEST_RESULT_FADE_MS)
  }

  private scheduleDetailTestOkDismiss(): void {
    this.clearDetailTestTimer()
    this.detailTestTimer = setTimeout(() => this.beginDetailTestOkDismiss(), SERVICE_TEST_OK_DISPLAY_MS)
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
    const btn = this.getDetailTestButton()
    const icon = this.getDetailTestIcon()
    if (!btn || !icon) {
      return
    }

    this.clearDetailTestTimer()
    this.clearDetailTestFeedbackUi()
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
      if (!this.testAllRunning) {
        btn.disabled = false
      }
      this.scheduleDetailTestOkDismiss()
      return
    }

    btn.classList.add('is-error')
    setIconSlotKey(icon, 'close')
    if (!this.testAllRunning) {
      btn.disabled = false
    }
  }

  private async runDetailConnectionTest(): Promise<void> {
    const input = this.readFormInput()
    if (!this.validateRequiredDetailFields(input)) {
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

  private async runServiceTest(serviceId: string, options?: { batch?: boolean }): Promise<boolean> {
    if (this.testAllRunning && !options?.batch) {
      return false
    }

    const icon = this.getServiceTestButton(serviceId)?.querySelector('.mm-icon-slot') as HTMLElement | null
    if (!options?.batch && icon?.classList.contains('mm-icon-spin')) {
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

    const serviceIds = this.services.map((service) => service.id)
    this.clearBatchTestDismissTimer()
    for (const serviceId of serviceIds) {
      this.clearServiceTestTimer(serviceId)
    }

    this.testAllRunning = true
    this.setTestAllListActive(true)
    this.setTestAllBusy(true)
    const detailTestBtn = this.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
    if (detailTestBtn) {
      detailTestBtn.disabled = true
    }

    let results: boolean[] = []
    try {
      results = await Promise.all(serviceIds.map((serviceId) => this.runServiceTest(serviceId, { batch: true })))
    } finally {
      this.testAllRunning = false
      this.setTestAllListActive(false)
      this.setTestAllBusy(false)
      if (detailTestBtn) {
        detailTestBtn.disabled = false
      }
      this.finishBatchServiceTestButtons(serviceIds)
    }

    const passedIds = serviceIds.filter((_, index) => results[index])
    this.scheduleBatchOkDismiss(passedIds)

    const passed = results.filter(Boolean).length
    const total = serviceIds.length
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
        await createServiceFromOptions({
          label: input.label,
          baseUrl: input.baseUrl,
          scriptKey: input.scriptKey,
          enabled: input.enabled,
          developMode: this.developModeTouched ? input.developMode : defaultDevelopModeForBaseUrl(input.baseUrl),
          gmScope: input.gmScope,
        })
        showMmNotification(existingScriptKey ? 'Service created (shared script key).' : 'Service created.', 'success')
        if (!isValidScriptKeyFormat(input.scriptKey)) {
          showMmNotification('Script key format looks unusual.', 'warn')
        }
        this.createMode = false
        await this.reload()
        return
      }

      if (!this.activeServiceId) {
        showMmNotification('Select a service to save.', 'error')
        return
      }

      await saveActiveServiceFromOptions({
        serviceId: this.activeServiceId,
        ...input,
        developMode: this.developModeTouched ? input.developMode : defaultDevelopModeForBaseUrl(input.baseUrl),
      })
      showMmNotification('Saved.', 'success')
      if (!isValidScriptKeyFormat(input.scriptKey)) {
        showMmNotification('Script key format looks unusual.', 'warn')
      }
      await this.reload()
    } catch (error) {
      showMmNotification(error instanceof Error ? error.message : 'Save failed.', 'error')
    }
  }

  private confirmResetDetailForm(): boolean {
    if (this.createMode) {
      return window.confirm('Reset this form? Unsaved entries will be discarded.')
    }
    const service = this.activeServiceId ? this.services.find((entry) => entry.id === this.activeServiceId) : undefined
    const name = service?.label.trim() || service?.baseUrl || 'this service'
    return window.confirm(`Reset form to last saved values for “${name}”?\n\nUnsaved changes will be discarded.`)
  }

  private async resetDetailForm(): Promise<void> {
    const mode = this.currentDetailMode()
    if (mode === 'empty') {
      return
    }
    if (!this.confirmResetDetailForm()) {
      return
    }

    this.clearAllFieldErrors()
    this.setDetailTestState('idle')

    if (this.createMode) {
      this.applyDraftDetail()
      this.setDetailMode('create')
      this.setStatus('Form reset.', 'idle')
      return
    }

    if (!this.activeServiceId) {
      return
    }

    await this.reload()
    this.setStatus('Form reset to last saved values.', 'ok')
  }

  private confirmDeleteService(service: ServiceProfile): boolean {
    const name = service.label.trim() || service.baseUrl
    return window.confirm(
      `Delete “${name}”?\n\n${service.baseUrl} · ${formatScriptKeyShort(service.scriptKey)}\n\nOTA cache for this endpoint will be cleared. This cannot be undone.`
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
}
