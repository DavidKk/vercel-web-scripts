import { defaultDevelopModeForBaseUrl, formatScriptKeyShort, isValidScriptKeyFormat } from '@ext/shared/extension-services'
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
import { type ScriptKeyMeta, type ServiceProfile, SERVICES_STORAGE_KEY } from '@ext/types'

import { subscribeAdminViewActivated } from '../admin/mm-admin-view-lifecycle'
import { hydrateMmIcons } from '../mm-icons'
import { showMmNotification } from '../mm-notification'
import { initMmTooltipDelegation } from '../shared/mm-tooltip'
import {
  clearBatchTestDismissTimer,
  clearDetailTestTimerOnDisconnect,
  runAllServiceTests,
  runDetailConnectionTest,
  runServiceTestById,
  setDetailTestState as applyDetailTestState,
} from './mm-options-connection-test'
import {
  applyDraftDetail,
  applyServiceDetail,
  clearAllFieldErrors,
  clearFieldError,
  confirmDiscardDetailChanges as confirmDiscardDetailChangesForm,
  currentDetailModeForHost,
  readFormInput,
  setDetailMode,
  setStatus,
  syncScriptKeyFieldOnInput,
  toggleScriptKeyVisibility,
  updateScriptKeyHint,
  updateSuggestedServiceFields,
  validateFormInput,
} from './mm-options-detail-form'
import { bindListDragReorder } from './mm-options-drag-reorder'
import { renderServiceList } from './mm-options-list-render'
import type { DetailFormBaseline, ServiceTestState } from './mm-options-types'

/**
 * Options page controller — multi-service list + detail panel.
 */
export class MmOptionsApp extends HTMLElement {
  private bound = false
  createMode = false
  activeServiceId: string | null = null
  services: ServiceProfile[] = []
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  testAllRunning = false
  serviceTestTimers = new Map<string, ReturnType<typeof setTimeout>>()
  batchTestDismissTimer: ReturnType<typeof setTimeout> | undefined
  detailTestTimer: ReturnType<typeof setTimeout> | undefined
  dragServiceId: string | null = null
  /** Set on drag-handle mousedown; cleared on mouseup/dragend. Gates row dragstart. */
  listDragRowId: string | null = null
  dropPlaceholderEl: HTMLElement | null = null
  scriptKeyRefCount = 0
  scriptKeyStored = ''
  scriptKeyRevealed = true
  scriptKeyMeta: ScriptKeyMeta[] = []
  gmScopeTouched = false
  permissionModeTouched = false
  labelTouched = false
  developModeTouched = false
  listDragBound = false
  detailFormBaseline: DetailFormBaseline | null = null
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
    clearBatchTestDismissTimer(this)
    clearDetailTestTimerOnDisconnect(this)
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
      void runAllServiceTests(this, this)
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
        void runServiceTestById(this, this, testBtn.dataset.serviceId)
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
      void runDetailConnectionTest(this, this)
    })
    this.querySelector('[data-action="toggle-script-key"]')?.addEventListener('click', () => {
      toggleScriptKeyVisibility(this, this)
    })

    const listEl = this.querySelector('[data-ref="service-list"]') as HTMLUListElement | null
    if (listEl) {
      bindListDragReorder(this, listEl)
    }

    this.querySelector('[data-ref="script-key"]')?.addEventListener('input', () => {
      clearFieldError(this, 'script-key')
      syncScriptKeyFieldOnInput(this, this)
      updateScriptKeyHint(this, this)
      updateSuggestedServiceFields(this, this)
    })
    this.querySelector('[data-ref="base-url"]')?.addEventListener('input', () => {
      clearFieldError(this, 'base-url')
      updateSuggestedServiceFields(this, this)
    })
    this.querySelector('[data-ref="label"]')?.addEventListener('input', () => {
      this.labelTouched = true
      updateSuggestedServiceFields(this, this)
    })
    this.querySelector('[data-ref="gm-scope"]')?.addEventListener('input', () => {
      this.gmScopeTouched = true
    })
    this.querySelector('[data-ref="permission-mode"]')
      ?.closest('mm-select')
      ?.addEventListener('mm-select-change', () => {
        this.permissionModeTouched = true
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
      setDetailMode(this, this, 'create')
      return
    }
    if (this.activeServiceId && detail.service) {
      applyServiceDetail(this, this, detail.service, detail.gmScope, detail.scriptKeyRefCount)
      setDetailMode(this, this, 'edit')
      return
    }
    this.activeServiceId = null
    const otaHint = this.querySelector('[data-ref="ota-hint"]') as HTMLElement | null
    if (otaHint) {
      otaHint.hidden = true
    }
    setDetailMode(this, this, 'empty')
  }

  private renderServiceList(): void {
    renderServiceList(this, this)
  }

  async applyServiceReorder(serviceId: string, insertAt: number): Promise<void> {
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
    setStatus(this, 'Order updated. Top row has highest OTA priority.', 'ok')
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
      applyServiceDetail(this, this, detail.service, detail.gmScope, detail.scriptKeyRefCount, { preserveTestUi: true })
    }
    this.renderServiceList()
    setStatus(this, enabled ? 'Service enabled.' : 'Service disabled (skipped for OTA). Reload open shop tabs to apply the next server.', 'ok')
  }

  async selectService(serviceId: string): Promise<void> {
    this.createMode = false
    this.activeServiceId = serviceId
    await setActiveServiceId(serviceId)
    await this.reload()
  }

  async deselectService(): Promise<void> {
    this.createMode = false
    this.activeServiceId = null
    await clearActiveServiceId()
    this.renderServiceList()
    setDetailMode(this, this, 'empty')
    setStatus(this, '', 'idle')
  }

  private enterCreateMode(): void {
    this.createMode = true
    this.activeServiceId = null
    this.renderServiceList()
    applyDraftDetail(this, this)
    setDetailMode(this, this, 'create')
    setStatus(this, 'New service — fill in connection details and save.', 'idle')
  }

  /** Prompt when leaving Servers detail with unsaved edits (admin tab router). */
  confirmDiscardDetailChanges(): boolean {
    return confirmDiscardDetailChangesForm(this, this)
  }

  setDetailTestState(state: ServiceTestState): void {
    applyDetailTestState(this, this, state)
  }

  private async save(): Promise<void> {
    const input = readFormInput(this, this)
    if (!validateFormInput(this, this, input)) {
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
          developMode: input.developMode,
          gmScope: input.gmScope,
          permissionMode: input.permissionMode,
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
    const mode = currentDetailModeForHost(this, this)
    if (mode === 'empty') {
      return
    }
    if (!this.confirmResetDetailForm()) {
      return
    }

    clearAllFieldErrors(this)
    applyDetailTestState(this, this, 'idle')

    if (this.createMode) {
      applyDraftDetail(this, this)
      setDetailMode(this, this, 'create')
      setStatus(this, 'Form reset.', 'idle')
      return
    }

    if (!this.activeServiceId) {
      return
    }

    await this.reload()
    setStatus(this, 'Form reset to last saved values.', 'ok')
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
    setStatus(this, 'Service deleted.', 'ok')
  }

  private async deleteActive(): Promise<void> {
    if (!this.activeServiceId) {
      return
    }
    await this.deleteServiceById(this.activeServiceId)
  }
}
