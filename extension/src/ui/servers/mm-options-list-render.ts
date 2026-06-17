import { formatScriptKeyShort, resolveOtaEndpoint } from '@ext/shared/extension-services'
import type { ServiceProfile } from '@ext/types'

import { hydrateMmIcons } from '../mm-icons'

export interface MmOptionsListRenderHost {
  services: ServiceProfile[]
  createMode: boolean
  activeServiceId: string | null
  listDragRowId: string | null
  dragServiceId: string | null
  confirmDiscardDetailChanges(): boolean
  selectService(serviceId: string): Promise<void>
  deselectService(): Promise<void>
}

/** Render the service list rows and empty state. */
export function renderServiceList(host: MmOptionsListRenderHost, root: HTMLElement): void {
  const listEl = root.querySelector('[data-ref="service-list"]') as HTMLUListElement | null
  const emptyEl = root.querySelector('[data-ref="service-list-empty"]') as HTMLElement | null
  const scrollEl = root.querySelector('[data-ref="list-scroll"]') as HTMLElement | null
  if (!listEl || !emptyEl) {
    return
  }

  const hasServices = host.services.length > 0
  scrollEl?.classList.toggle('is-empty', !hasServices)
  listEl.classList.toggle('hidden', !hasServices)

  listEl.replaceChildren()
  const scriptKeyCounts = new Map<string, number>()
  for (const service of host.services) {
    const key = service.scriptKey.trim()
    scriptKeyCounts.set(key, (scriptKeyCounts.get(key) ?? 0) + 1)
  }

  for (const service of host.services) {
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
      host.listDragRowId = service.id
      const releaseGate = (): void => {
        window.removeEventListener('mouseup', releaseGate)
        window.setTimeout(() => {
          if (!host.dragServiceId) {
            host.listDragRowId = null
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
    card.setAttribute('aria-selected', String(!host.createMode && service.id === host.activeServiceId))

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
      devBadge.textContent = 'Auto-reload'
      devBadge.setAttribute('data-mm-tooltip', 'Extension auto-reload enabled for this service')
      badges.appendChild(devBadge)
    }

    const otaService = resolveOtaEndpoint(service.scriptKey, host.services)
    if (otaService?.id === service.id && service.enabled) {
      const otaBadge = document.createElement('span')
      otaBadge.className = 'mm-options-service-badge'
      otaBadge.textContent = 'OTA primary'
      badges.appendChild(otaBadge)
    } else if (otaService && service.enabled) {
      const otaRefBadge = document.createElement('span')
      otaRefBadge.className = 'mm-options-service-badge is-shared'
      const otaLabel = otaService.label.trim() || otaService.baseUrl
      otaRefBadge.textContent = `OTA: ${otaLabel}`
      otaRefBadge.setAttribute('data-mm-tooltip', 'Pages load scripts from this server (first enabled row for the script key). Reload tabs after changing order or enablement.')
      badges.appendChild(otaRefBadge)
    }

    body.append(label, meta, badges)
    body.addEventListener('click', () => {
      if (!host.createMode && host.activeServiceId === service.id) {
        if (!host.confirmDiscardDetailChanges()) {
          return
        }
        void host.deselectService()
        return
      }
      if (!host.confirmDiscardDetailChanges()) {
        return
      }
      void host.selectService(service.id)
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
