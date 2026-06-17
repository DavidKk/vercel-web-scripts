import type { ServiceProfile } from '@ext/types'

import { setIconSlotKey, setIconSlotLoading } from '../mm-icons'
import { updateMmTooltip } from '../shared/mm-tooltip'
import { type MmOptionsDetailFormHost, readFormInput, setStatus, validateRequiredDetailFields } from './mm-options-detail-form'
import { DETAIL_TEST_TOOLTIPS, SERVICE_TEST_OK_DISPLAY_MS, SERVICE_TEST_RESULT_FADE_MS, type ServiceTestState } from './mm-options-types'

export interface MmOptionsConnectionTestHost extends MmOptionsDetailFormHost {
  services: ServiceProfile[]
  activeServiceId: string | null
  testAllRunning: boolean
  serviceTestTimers: Map<string, ReturnType<typeof setTimeout>>
  batchTestDismissTimer: ReturnType<typeof setTimeout> | undefined
  detailTestTimer: ReturnType<typeof setTimeout> | undefined
}

export async function pingEndpoint(baseUrl: string, scriptKey: string): Promise<boolean> {
  const url = `${baseUrl}/api/tampermonkey/${encodeURIComponent(scriptKey)}/scripts/version`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    return false
  }
  const body = (await res.json()) as { code?: number; data?: { gistUpdatedAt?: number } }
  return body.code === 0 && typeof body.data?.gistUpdatedAt === 'number'
}

function getServiceTestButton(root: HTMLElement, serviceId: string): HTMLButtonElement | null {
  return root.querySelector(`[data-action="test-service"][data-service-id="${CSS.escape(serviceId)}"]`)
}

function getServiceRow(root: HTMLElement, serviceId: string): HTMLElement | null {
  return root.querySelector(`[data-ref="service-list"] .mm-options-service-row[data-service-id="${CSS.escape(serviceId)}"]`)
}

function getServiceCard(root: HTMLElement, serviceId: string): HTMLElement | null {
  return getServiceRow(root, serviceId)?.querySelector('.mm-options-service-card') ?? null
}

function setTestAllListActive(root: HTMLElement, active: boolean): void {
  root.querySelector('[data-ref="service-list"]')?.classList.toggle('is-test-all-active', active)
}

function clearServiceTestFail(root: HTMLElement, serviceId: string): void {
  getServiceCard(root, serviceId)?.classList.remove('is-test-fail')
}

function clearServiceTestTimer(host: MmOptionsConnectionTestHost, serviceId: string): void {
  const timer = host.serviceTestTimers.get(serviceId)
  if (timer) {
    clearTimeout(timer)
    host.serviceTestTimers.delete(serviceId)
  }
}

function clearServiceTestFeedbackUi(root: HTMLElement, serviceId: string): void {
  const card = getServiceCard(root, serviceId)
  card?.classList.remove('is-test-feedback', 'is-test-feedback-exit')
}

/** After success: fade all row actions together → swap test icon while hidden. */
function beginServiceTestOkDismiss(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceId: string): void {
  const btn = getServiceTestButton(root, serviceId)
  const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
  const card = getServiceCard(root, serviceId)
  if (!btn || !icon) {
    setServiceTestState(host, root, serviceId, 'idle')
    return
  }

  card?.classList.add('is-test-feedback-exit')
  host.serviceTestTimers.set(
    serviceId,
    setTimeout(() => {
      btn.classList.remove('is-ok')
      setIconSlotKey(icon, 'test')
      card?.classList.remove('is-test-feedback', 'is-test-feedback-exit')
      if (!host.testAllRunning) {
        btn.disabled = false
      }
      host.serviceTestTimers.delete(serviceId)
    }, SERVICE_TEST_RESULT_FADE_MS)
  )
}

function scheduleServiceTestOkDismiss(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceId: string): void {
  clearServiceTestTimer(host, serviceId)
  host.serviceTestTimers.set(
    serviceId,
    setTimeout(() => beginServiceTestOkDismiss(host, root, serviceId), SERVICE_TEST_OK_DISPLAY_MS)
  )
}

export function clearBatchTestDismissTimer(host: MmOptionsConnectionTestHost): void {
  if (host.batchTestDismissTimer) {
    clearTimeout(host.batchTestDismissTimer)
    host.batchTestDismissTimer = undefined
  }
}

/** Test-all: wait once, then fade every successful row's actions in sync. */
function scheduleBatchOkDismiss(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceIds: string[]): void {
  clearBatchTestDismissTimer(host)
  if (serviceIds.length === 0) {
    return
  }
  host.batchTestDismissTimer = setTimeout(() => {
    host.batchTestDismissTimer = undefined
    beginBatchOkDismiss(host, root, serviceIds)
  }, SERVICE_TEST_OK_DISPLAY_MS)
}

function beginBatchOkDismiss(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceIds: string[]): void {
  for (const serviceId of serviceIds) {
    getServiceCard(root, serviceId)?.classList.add('is-test-feedback-exit')
  }

  setTimeout(() => {
    for (const serviceId of serviceIds) {
      const btn = getServiceTestButton(root, serviceId)
      const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
      btn?.classList.remove('is-ok')
      if (icon) {
        setIconSlotKey(icon, 'test')
      }
      if (btn) {
        btn.disabled = false
      }
      clearServiceTestFeedbackUi(root, serviceId)
    }
  }, SERVICE_TEST_RESULT_FADE_MS)
}

export function setServiceTestState(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceId: string, state: ServiceTestState): void {
  const btn = getServiceTestButton(root, serviceId)
  const icon = btn?.querySelector('.mm-icon-slot') as HTMLElement | null
  const card = getServiceCard(root, serviceId)

  if (state === 'loading') {
    clearServiceTestTimer(host, serviceId)
    clearServiceTestFeedbackUi(root, serviceId)
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
    clearServiceTestTimer(host, serviceId)
    clearServiceTestFeedbackUi(root, serviceId)
    if (btn) {
      btn.classList.remove('is-error')
      btn.classList.add('is-ok')
      btn.disabled = host.testAllRunning
    }
    if (icon) {
      setIconSlotKey(icon, 'check')
    }
    clearServiceTestFail(root, serviceId)
    card?.classList.add('is-test-feedback')
    if (!host.testAllRunning) {
      scheduleServiceTestOkDismiss(host, root, serviceId)
    }
    return
  }

  if (state === 'error') {
    clearServiceTestTimer(host, serviceId)
    card?.classList.remove('is-test-feedback-exit')
    if (btn) {
      btn.classList.remove('is-ok')
      btn.classList.add('is-error')
      btn.disabled = host.testAllRunning
    }
    if (icon) {
      setIconSlotKey(icon, 'close')
    }
    card?.classList.add('is-test-fail', 'is-test-feedback')
    return
  }

  if (state === 'idle') {
    clearServiceTestTimer(host, serviceId)
    clearServiceTestFeedbackUi(root, serviceId)
    if (btn) {
      btn.classList.remove('is-ok', 'is-error')
      btn.disabled = host.testAllRunning
    }
    if (icon) {
      setIconSlotKey(icon, 'test')
    }
    clearServiceTestFail(root, serviceId)
  }
}

function finishBatchServiceTestButtons(root: HTMLElement, serviceIds: string[]): void {
  for (const serviceId of serviceIds) {
    const btn = getServiceTestButton(root, serviceId)
    if (btn) {
      btn.disabled = false
    }
  }
}

function setTestAllBusy(root: HTMLElement, busy: boolean): void {
  const btn = root.querySelector('[data-action="test-all"]') as HTMLButtonElement | null
  const icon = root.querySelector('[data-ref="test-all-icon"]') as HTMLElement | null
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

function resolveTestEndpoint(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceId: string): { baseUrl: string; scriptKey: string } | null {
  const service = host.services.find((s) => s.id === serviceId)
  if (!service) {
    return null
  }
  if (serviceId === host.activeServiceId) {
    const input = readFormInput(host, root)
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

function clearDetailTestTimer(host: MmOptionsConnectionTestHost): void {
  if (host.detailTestTimer) {
    clearTimeout(host.detailTestTimer)
    host.detailTestTimer = undefined
  }
}

function getDetailTestButton(root: HTMLElement): HTMLButtonElement | null {
  return root.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
}

function getDetailTestIcon(root: HTMLElement): HTMLElement | null {
  return root.querySelector('[data-ref="test-connection-icon"]') as HTMLElement | null
}

function clearDetailTestFeedbackUi(root: HTMLElement): void {
  getDetailTestButton(root)?.classList.remove('is-test-feedback-exit')
}

function beginDetailTestOkDismiss(host: MmOptionsConnectionTestHost, root: HTMLElement): void {
  const btn = getDetailTestButton(root)
  const icon = getDetailTestIcon(root)
  if (!btn || !icon) {
    setDetailTestState(host, root, 'idle')
    return
  }

  btn.classList.add('is-test-feedback-exit')
  host.detailTestTimer = setTimeout(() => {
    btn.classList.remove('is-ok', 'is-test-feedback-exit')
    setIconSlotKey(icon, 'test')
    if (!host.testAllRunning) {
      btn.disabled = false
    }
    host.detailTestTimer = undefined
  }, SERVICE_TEST_RESULT_FADE_MS)
}

function scheduleDetailTestOkDismiss(host: MmOptionsConnectionTestHost, root: HTMLElement): void {
  clearDetailTestTimer(host)
  host.detailTestTimer = setTimeout(() => beginDetailTestOkDismiss(host, root), SERVICE_TEST_OK_DISPLAY_MS)
}

function applyDetailTestTooltip(root: HTMLElement, state: ServiceTestState): void {
  const btn = root.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
  if (!btn) {
    return
  }
  const label = DETAIL_TEST_TOOLTIPS[state]
  updateMmTooltip(btn, label, 'bottom')
  btn.setAttribute('aria-label', label)
}

export function setDetailTestState(host: MmOptionsConnectionTestHost, root: HTMLElement, state: ServiceTestState): void {
  const btn = getDetailTestButton(root)
  const icon = getDetailTestIcon(root)
  if (!btn || !icon) {
    return
  }

  clearDetailTestTimer(host)
  clearDetailTestFeedbackUi(root)
  btn.classList.remove('is-ok', 'is-error')
  btn.disabled = state === 'loading' || host.testAllRunning
  applyDetailTestTooltip(root, state)

  if (state === 'loading') {
    setIconSlotLoading(icon, true)
    return
  }

  if (state === 'idle') {
    setIconSlotKey(icon, 'test')
    if (!host.testAllRunning) {
      btn.disabled = false
    }
    return
  }

  if (state === 'ok') {
    btn.classList.add('is-ok')
    setIconSlotKey(icon, 'check')
    if (!host.testAllRunning) {
      btn.disabled = false
    }
    scheduleDetailTestOkDismiss(host, root)
    return
  }

  btn.classList.add('is-error')
  setIconSlotKey(icon, 'close')
  if (!host.testAllRunning) {
    btn.disabled = false
  }
}

export async function runDetailConnectionTest(host: MmOptionsConnectionTestHost, root: HTMLElement): Promise<void> {
  const input = readFormInput(host, root)
  if (!validateRequiredDetailFields(host, root, input)) {
    setDetailTestState(host, root, 'error')
    return
  }

  const icon = root.querySelector('[data-ref="test-connection-icon"]') as HTMLElement | null
  if (icon?.classList.contains('mm-icon-spin')) {
    return
  }

  setDetailTestState(host, root, 'loading')
  setStatus(root, 'Testing connection…', 'idle')
  try {
    const ok = await pingEndpoint(input.baseUrl, input.scriptKey)
    setDetailTestState(host, root, ok ? 'ok' : 'error')
    setStatus(root, ok ? 'Connection OK.' : 'Could not reach server. Check URL and script key.', ok ? 'ok' : 'error')
    if (host.activeServiceId) {
      setServiceTestState(host, root, host.activeServiceId, ok ? 'ok' : 'error')
    }
  } catch {
    setDetailTestState(host, root, 'error')
    setStatus(root, 'Could not reach server. Check URL and script key.', 'error')
    if (host.activeServiceId) {
      setServiceTestState(host, root, host.activeServiceId, 'error')
    }
  }
}

async function runServiceTest(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceId: string, options?: { batch?: boolean }): Promise<boolean> {
  if (host.testAllRunning && !options?.batch) {
    return false
  }

  const icon = getServiceTestButton(root, serviceId)?.querySelector('.mm-icon-slot') as HTMLElement | null
  if (!options?.batch && icon?.classList.contains('mm-icon-spin')) {
    return false
  }

  const endpoint = resolveTestEndpoint(host, root, serviceId)
  if (!endpoint) {
    setServiceTestState(host, root, serviceId, 'error')
    return false
  }

  setServiceTestState(host, root, serviceId, 'loading')
  try {
    const ok = await pingEndpoint(endpoint.baseUrl, endpoint.scriptKey)
    setServiceTestState(host, root, serviceId, ok ? 'ok' : 'error')
    return ok
  } catch {
    setServiceTestState(host, root, serviceId, 'error')
    return false
  }
}

export async function runAllServiceTests(host: MmOptionsConnectionTestHost, root: HTMLElement): Promise<void> {
  if (host.testAllRunning || host.services.length === 0) {
    return
  }

  const serviceIds = host.services.map((service) => service.id)
  clearBatchTestDismissTimer(host)
  for (const serviceId of serviceIds) {
    clearServiceTestTimer(host, serviceId)
  }

  host.testAllRunning = true
  setTestAllListActive(root, true)
  setTestAllBusy(root, true)
  const detailTestBtn = root.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
  if (detailTestBtn) {
    detailTestBtn.disabled = true
  }

  let results: boolean[] = []
  try {
    results = await Promise.all(serviceIds.map((serviceId) => runServiceTest(host, root, serviceId, { batch: true })))
  } finally {
    host.testAllRunning = false
    setTestAllListActive(root, false)
    setTestAllBusy(root, false)
    if (detailTestBtn) {
      detailTestBtn.disabled = false
    }
    finishBatchServiceTestButtons(root, serviceIds)
  }

  const passedIds = serviceIds.filter((_, index) => results[index])
  scheduleBatchOkDismiss(host, root, passedIds)

  const passed = results.filter(Boolean).length
  const total = serviceIds.length
  if (passed === total) {
    setStatus(root, `All ${total} connection(s) OK.`, 'ok')
    return
  }
  setStatus(root, `${passed}/${total} connection(s) OK.`, passed > 0 ? 'idle' : 'error')
}

export async function runServiceTestById(host: MmOptionsConnectionTestHost, root: HTMLElement, serviceId: string): Promise<void> {
  await runServiceTest(host, root, serviceId)
}

export function clearDetailTestTimerOnDisconnect(host: MmOptionsConnectionTestHost): void {
  clearDetailTestTimer(host)
}
