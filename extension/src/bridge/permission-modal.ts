import { formatPermissionCapabilityLabel, type ScriptPermissionDecision, type ScriptPermissionRemember } from '@shared/script-permission'

import { permissionLogger } from '../shared/logger'
import { PERMISSION_MODAL_MESSAGE_TYPE, PERMISSION_MODAL_RESULT_MESSAGE_TYPE, PERMISSION_MODAL_WINDOW_EVENT, type PermissionModalShowPayload } from '../shell/permission-manager'

const MODAL_HOST_ID = 'vws-permission-modal-host'

let modalOpen = false
let activeBatchId: string | null = null

function ensureHost(): HTMLElement {
  let host = document.getElementById(MODAL_HOST_ID)
  if (host) {
    return host
  }
  host = document.createElement('div')
  host.id = MODAL_HOST_ID
  host.style.position = 'fixed'
  host.style.inset = '0'
  host.style.zIndex = '2147483646'
  host.style.pointerEvents = 'none'
  document.documentElement.appendChild(host)
  return host
}

function removeHost(): void {
  document.getElementById(MODAL_HOST_ID)?.remove()
  modalOpen = false
  activeBatchId = null
}

/** Show permission modal (extension admin / relayed from background). */
export function showPermissionModal(payload: PermissionModalShowPayload): void {
  permissionLogger.info('modal:render', {
    batchId: payload.batchId,
    itemCount: payload.items.length,
    items: payload.items.map((item) => `${item.file}:${item.capability}:${item.resource}`),
  })
  renderModal(payload)
}

function renderModal(payload: PermissionModalShowPayload): void {
  const host = ensureHost()
  host.style.pointerEvents = 'auto'
  modalOpen = true

  if (activeBatchId === payload.batchId && host.shadowRoot) {
    updateModalItems(host.shadowRoot, payload)
    return
  }

  if (modalOpen) {
    removeHost()
  }
  activeBatchId = payload.batchId
  modalOpen = true
  const freshHost = ensureHost()
  freshHost.style.pointerEvents = 'auto'

  const shadow = freshHost.attachShadow({ mode: 'open' })
  mountModalShell(shadow, payload)
}

function mountModalShell(shadow: ShadowRoot, payload: PermissionModalShowPayload): void {
  const style = document.createElement('style')
  style.textContent = `
    :host, * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    .backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .panel {
      width: min(560px, 100%); max-height: min(75vh, 680px); overflow: auto;
      background: #fff; color: #0f172a; border-radius: 12px; box-shadow: 0 20px 50px rgba(15,23,42,.25);
      padding: 20px;
    }
    h2 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0 0 16px; color: #475569; font-size: 14px; line-height: 1.5; }
    ul { margin: 0 0 16px; padding: 0; list-style: none; }
    li {
      border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
      font-size: 13px; display: flex; gap: 12px; align-items: center; justify-content: space-between;
    }
    li .meta { flex: 1; min-width: 0; }
    li strong { display: block; margin-bottom: 4px; word-break: break-all; }
  li span { color: #64748b; word-break: break-all; }
    .row-decision { flex-shrink: 0; }
    .row-decision select {
      border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; font-size: 13px;
      background: #fff;
    }
    .remember { margin-bottom: 16px; font-size: 13px; color: #475569; }
    .remember select {
      margin-left: 8px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    button {
      border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
      border-radius: 8px; padding: 8px 12px; font-size: 13px; cursor: pointer;
    }
    button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    button.danger { background: #fff; color: #b91c1c; border-color: #fecaca; }
  `

  const backdrop = document.createElement('div')
  backdrop.className = 'backdrop'

  const panel = document.createElement('div')
  panel.className = 'panel'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')

  const title = document.createElement('h2')
  title.textContent = 'Script permission request'

  const desc = document.createElement('p')
  desc.textContent = 'A MagickMonkey script is requesting sensitive capabilities. Choose allow or deny for each item.'

  const list = document.createElement('ul')
  list.dataset.ref = 'items'

  const rememberRow = document.createElement('div')
  rememberRow.className = 'remember'
  rememberRow.innerHTML =
    'Remember choice:<select data-ref="remember"><option value="once">Allow once</option><option value="session">This tab</option><option value="persistent">Always</option></select>'

  const actions = document.createElement('div')
  actions.className = 'actions'

  const denyAllBtn = document.createElement('button')
  denyAllBtn.className = 'danger'
  denyAllBtn.textContent = 'Deny all'
  denyAllBtn.addEventListener('click', () => {
    setAllDecisions(list, 'deny')
    submitDecisions(shadow, payload, list, 'session')
  })

  const allowOnceBtn = document.createElement('button')
  allowOnceBtn.textContent = 'Allow once'
  allowOnceBtn.addEventListener('click', () => {
    setAllDecisions(list, 'allow')
    submitDecisions(shadow, payload, list, 'once')
  })

  const confirmBtn = document.createElement('button')
  confirmBtn.className = 'primary'
  confirmBtn.textContent = 'Confirm'
  confirmBtn.addEventListener('click', () => {
    const remember = readRemember(rememberRow)
    submitDecisions(shadow, payload, list, remember)
  })

  actions.append(denyAllBtn, allowOnceBtn, confirmBtn)
  panel.append(title, desc, list, rememberRow, actions)
  backdrop.appendChild(panel)
  shadow.append(style, backdrop)

  populateItems(list, payload)
}

function updateModalItems(shadow: ShadowRoot, payload: PermissionModalShowPayload): void {
  const list = shadow.querySelector<HTMLUListElement>('ul[data-ref="items"]')
  if (!list) {
    return
  }
  populateItems(list, payload)
}

function populateItems(list: HTMLUListElement, payload: PermissionModalShowPayload): void {
  const existing = new Map<string, HTMLSelectElement>()
  for (const select of list.querySelectorAll<HTMLSelectElement>('select[data-request-id]')) {
    const id = select.dataset.requestId
    if (id) {
      existing.set(id, select)
    }
  }

  list.replaceChildren()
  for (const item of payload.items) {
    const li = document.createElement('li')

    const meta = document.createElement('div')
    meta.className = 'meta'
    const strong = document.createElement('strong')
    strong.textContent = item.file
    const cap = document.createElement('span')
    cap.textContent = `${formatPermissionCapabilityLabel(item.capability)}：${item.resource}`
    meta.append(strong, cap)

    const decisionWrap = document.createElement('div')
    decisionWrap.className = 'row-decision'
    const select = document.createElement('select')
    select.dataset.requestId = item.requestId
    select.innerHTML = '<option value="allow">Allow</option><option value="deny">Deny</option>'
    const prev = existing.get(item.requestId)
    if (prev) {
      select.value = prev.value
    }
    decisionWrap.appendChild(select)

    li.append(meta, decisionWrap)
    list.appendChild(li)
  }
}

function setAllDecisions(list: HTMLUListElement, decision: ScriptPermissionDecision): void {
  for (const select of list.querySelectorAll<HTMLSelectElement>('select[data-request-id]')) {
    select.value = decision
  }
}

function readRemember(rememberRow: HTMLElement): ScriptPermissionRemember {
  const select = rememberRow.querySelector<HTMLSelectElement>('select[data-ref="remember"]')
  const value = select?.value
  if (value === 'session' || value === 'persistent') {
    return value
  }
  return 'once'
}

function submitDecisions(shadow: ShadowRoot, payload: PermissionModalShowPayload, list: HTMLUListElement, remember: ScriptPermissionRemember): void {
  const decisions = payload.items.map((item) => {
    const select = list.querySelector<HTMLSelectElement>(`select[data-request-id="${item.requestId}"]`)
    const decision = select?.value === 'deny' ? 'deny' : 'allow'
    return { requestId: item.requestId, decision, remember }
  })

  void chrome.runtime
    .sendMessage({
      type: PERMISSION_MODAL_RESULT_MESSAGE_TYPE,
      payload: {
        batchId: payload.batchId,
        decisions,
      },
    })
    .finally(() => {
      removeHost()
      void shadow
    })
}

/** Wire permission modal display (content script + extension admin pages). */
export function installPermissionModalListener(): void {
  window.addEventListener(PERMISSION_MODAL_WINDOW_EVENT, ((event: Event) => {
    const detail = (event as CustomEvent<PermissionModalShowPayload>).detail
    if (!detail?.batchId || !Array.isArray(detail.items)) {
      return
    }
    showPermissionModal(detail)
  }) as EventListener)

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return undefined
    }
    const typed = message as { type?: unknown; payload?: unknown; targetTabId?: unknown }
    if (typed.type !== PERMISSION_MODAL_MESSAGE_TYPE) {
      return undefined
    }
    const payload = typed.payload as PermissionModalShowPayload
    if (!payload?.batchId || !Array.isArray(payload.items)) {
      sendResponse({ ok: false })
      return false
    }

    const targetTabId = typeof typed.targetTabId === 'number' ? typed.targetTabId : null
    if (targetTabId != null) {
      const isExtensionDocument = typeof location !== 'undefined' && location.href.startsWith(chrome.runtime.getURL(''))
      if (!isExtensionDocument) {
        return undefined
      }
      void chrome.tabs.getCurrent((tab) => {
        if (tab?.id !== targetTabId) {
          return
        }
        renderModal(payload)
        sendResponse({ ok: true })
      })
      return true
    }

    renderModal(payload)
    sendResponse({ ok: true })
    return false
  })
}
