export interface MmOptionsDragReorderHost {
  listDragBound: boolean
  listDragRowId: string | null
  dragServiceId: string | null
  dropPlaceholderEl: HTMLElement | null
  applyServiceReorder(serviceId: string, insertAt: number): Promise<void>
}

/** Bind drag-and-drop reordering on the service list. */
export function bindListDragReorder(app: MmOptionsDragReorderHost, listEl: HTMLUListElement): void {
  if (app.listDragBound) {
    return
  }
  app.listDragBound = true

  const clearDragUi = (): void => {
    listEl.classList.remove('is-list-dragging')
    listEl.querySelectorAll('.is-dragging').forEach((el) => {
      el.classList.remove('is-dragging')
    })
    removeDropPlaceholder(app)
    app.dragServiceId = null
    app.listDragRowId = null
  }

  listEl.addEventListener('dragstart', (event) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.mm-options-service-row')
    const serviceId = row?.dataset.serviceId
    if (!serviceId || app.listDragRowId !== serviceId) {
      event.preventDefault()
      return
    }
    const card = row.querySelector('.mm-options-service-card') as HTMLElement | null
    if (!row || !card) {
      event.preventDefault()
      return
    }
    app.dragServiceId = serviceId
    row.classList.add('is-dragging')
    listEl.classList.add('is-list-dragging')
    setRowDragImage(event, card)
    event.dataTransfer?.setData('text/plain', serviceId)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  })

  listEl.addEventListener('dragend', () => {
    clearDragUi()
  })

  listEl.addEventListener('dragover', (event) => {
    if (!app.dragServiceId) {
      return
    }
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
    const afterRow = getDragAfterRow(listEl, event.clientY)
    placeDropPlaceholder(app, listEl, afterRow)
  })

  listEl.addEventListener('drop', (event) => {
    event.preventDefault()
    const draggedId = app.dragServiceId ?? event.dataTransfer?.getData('text/plain') ?? ''
    const insertAt = insertIndexFromDropPlaceholder(app, listEl, draggedId)
    clearDragUi()
    if (!draggedId || insertAt < 0) {
      return
    }
    void app.applyServiceReorder(draggedId, insertAt)
  })

  listEl.addEventListener('dragleave', (event) => {
    if (!app.dragServiceId) {
      return
    }
    const related = event.relatedTarget as Node | null
    if (related && listEl.contains(related)) {
      return
    }
    removeDropPlaceholder(app)
  })

  listEl.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-action="drag-handle"]')) {
      event.stopPropagation()
    }
  })
}

/** Floating card image while dragging (not the handle glyph). */
function setRowDragImage(event: DragEvent, card: HTMLElement): void {
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

function ensureDropPlaceholder(app: MmOptionsDragReorderHost): HTMLElement {
  if (!app.dropPlaceholderEl) {
    app.dropPlaceholderEl = document.createElement('li')
    app.dropPlaceholderEl.className = 'mm-servers-drop-placeholder'
    app.dropPlaceholderEl.setAttribute('aria-hidden', 'true')
  }
  return app.dropPlaceholderEl
}

function removeDropPlaceholder(app: MmOptionsDragReorderHost): void {
  app.dropPlaceholderEl?.remove()
}

function placeDropPlaceholder(app: MmOptionsDragReorderHost, listEl: HTMLUListElement, beforeRow: HTMLElement | null): void {
  const placeholder = ensureDropPlaceholder(app)
  if (beforeRow === null) {
    listEl.appendChild(placeholder)
    return
  }
  if (beforeRow !== placeholder) {
    listEl.insertBefore(placeholder, beforeRow)
  }
}

function getDragAfterRow(listEl: HTMLUListElement, clientY: number): HTMLElement | null {
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

function insertIndexFromDropPlaceholder(app: MmOptionsDragReorderHost, listEl: HTMLUListElement, draggedId: string): number {
  const placeholder = app.dropPlaceholderEl
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
