import {
  defaultDevelopModeForBaseUrl,
  defaultLabelFromBaseUrl,
  formatScriptKeyMasked,
  getGmScopeForScriptKey,
  getPermissionModeForScriptKey,
  isValidScriptKeyFormat,
  resolveOtaEndpoint,
} from '@ext/shared/extension-services'
import { DEFAULT_CONFIG, type ScriptKeyMeta, type ServiceProfile } from '@ext/types'
import type { ScriptPermissionMode } from '@shared/script-permission'

import { setIconSlotKey } from '../mm-icons'
import { updateMmTooltip } from '../shared/mm-tooltip'
import { type DetailFieldRef, type DetailFormBaseline, type DetailFormInput, type DetailMode, type ServiceTestState, STATUS_BASE } from './mm-options-types'

export interface MmOptionsDetailFormHost {
  createMode: boolean
  activeServiceId: string | null
  services: ServiceProfile[]
  scriptKeyMeta: ScriptKeyMeta[]
  scriptKeyRefCount: number
  scriptKeyStored: string
  scriptKeyRevealed: boolean
  labelTouched: boolean
  gmScopeTouched: boolean
  permissionModeTouched: boolean
  developModeTouched: boolean
  detailFormBaseline: DetailFormBaseline | null
  testAllRunning: boolean
  setDetailTestState(state: ServiceTestState): void
}

export function setStatus(root: HTMLElement, text: string, variant: 'idle' | 'ok' | 'error' = 'idle'): void {
  const statusEl = root.querySelector('[data-ref="status"]') as HTMLElement | null
  if (!statusEl) {
    return
  }
  statusEl.textContent = text
  statusEl.className = variant === 'error' ? `${STATUS_BASE} text-mm-danger` : variant === 'ok' ? `${STATUS_BASE} text-mm-success` : STATUS_BASE
}

export function applyDraftDetail(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  clearAllFieldErrors(root)
  host.setDetailTestState('idle')
  host.labelTouched = false
  host.gmScopeTouched = false
  host.permissionModeTouched = false
  host.developModeTouched = false
  ;(root.querySelector('[data-ref="label"]') as HTMLInputElement).value = ''
  ;(root.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = DEFAULT_CONFIG.baseUrl
  host.scriptKeyStored = ''
  host.scriptKeyRevealed = true
  ;(root.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked = true
  ;(root.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = defaultDevelopModeForBaseUrl(DEFAULT_CONFIG.baseUrl)
  setScriptKeyBadge(host, root, 0)
  updateSuggestedServiceFields(host, root)
  setPermissionModeValue(root, 'ask')
  syncScriptKeyFieldDisplay(host, root)
  updateScriptKeyHint(host, root)
  captureDetailFormBaseline(host, root)
}

export function applyServiceDetail(
  host: MmOptionsDetailFormHost,
  root: HTMLElement,
  service: ServiceProfile,
  gmScope: string,
  scriptKeyRefCount: number,
  options?: { preserveTestUi?: boolean }
): void {
  clearAllFieldErrors(root)
  if (!options?.preserveTestUi) {
    host.setDetailTestState('idle')
  }
  host.labelTouched = false
  host.gmScopeTouched = false
  host.permissionModeTouched = false
  host.developModeTouched = false
  ;(root.querySelector('[data-ref="label"]') as HTMLInputElement).value = service.label
  ;(root.querySelector('[data-ref="base-url"]') as HTMLInputElement).value = service.baseUrl
  host.scriptKeyStored = service.scriptKey
  host.scriptKeyRevealed = false
  ;(root.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value = gmScope
  setPermissionModeValue(root, getPermissionModeForScriptKey(service.scriptKey, host.scriptKeyMeta))
  ;(root.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked = service.enabled
  ;(root.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked = service.developMode === true
  setScriptKeyBadge(host, root, scriptKeyRefCount)
  syncScriptKeyFieldDisplay(host, root)
  updateScriptKeyHint(host, root)
  updateOtaHint(host, root, service)
  captureDetailFormBaseline(host, root)
}

/** Explain when the selected row is not the OTA representative for its script key. */
export function updateOtaHint(host: MmOptionsDetailFormHost, root: HTMLElement, service: ServiceProfile): void {
  const hint = root.querySelector('[data-ref="ota-hint"]') as HTMLElement | null
  if (!hint) {
    return
  }
  const ota = resolveOtaEndpoint(service.scriptKey, host.services)
  if (!service.enabled) {
    hint.hidden = false
    hint.textContent = 'This server is disabled and is not used for OTA. Enable it or pick another row.'
    return
  }
  if (ota && ota.id !== service.id) {
    hint.hidden = false
    const otaLabel = ota.label.trim() || ota.baseUrl
    hint.textContent = `OTA for this script key uses “${otaLabel}”. Open shop tabs load that server until you reload them.`
    return
  }
  hint.hidden = true
}

export function updateSuggestedServiceFields(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  const labelEl = root.querySelector('[data-ref="label"]') as HTMLInputElement | null
  const baseUrlEl = root.querySelector('[data-ref="base-url"]') as HTMLInputElement | null
  const gmScopeEl = root.querySelector('[data-ref="gm-scope"]') as HTMLInputElement | null
  if (!labelEl || !baseUrlEl || !gmScopeEl) {
    return
  }

  const baseUrl = baseUrlEl.value.trim().replace(/\/$/, '')
  if (!host.labelTouched && !labelEl.value.trim() && baseUrl) {
    labelEl.value = defaultLabelFromBaseUrl(baseUrl)
  }

  const scriptKey = readScriptKeyValue(host, root)
  if (!host.permissionModeTouched && scriptKey) {
    setPermissionModeValue(root, getPermissionModeForScriptKey(scriptKey, host.scriptKeyMeta))
  }

  if (host.gmScopeTouched) {
    return
  }

  if (!scriptKey) {
    gmScopeEl.value = ''
    return
  }

  gmScopeEl.value = getGmScopeForScriptKey(scriptKey, host.scriptKeyMeta, labelEl.value, baseUrl)
  syncDevelopModeDefaultFromBaseUrl(host, root)
}

export function setPermissionModeValue(root: HTMLElement, value: ScriptPermissionMode): void {
  const modeInput = root.querySelector('[data-ref="permission-mode"]') as HTMLInputElement | null
  const modeSelect = modeInput?.closest('mm-select') as HTMLElement | null
  if (!modeInput || !modeSelect) {
    return
  }
  modeInput.value = value
  const valueEl = modeSelect.querySelector('[data-ref="select-value"]') as HTMLElement | null
  if (valueEl) {
    valueEl.textContent = value === 'trust' ? 'Full trust' : 'Ask each time'
  }
  const leadingEl = modeSelect.querySelector('[data-ref="select-leading"]') as HTMLElement | null
  if (leadingEl) {
    setIconSlotKey(leadingEl, value === 'trust' ? 'permissionAllow' : 'permissionAsk')
  }
  modeSelect.querySelectorAll<HTMLElement>('.mm-select-menu [data-value]').forEach((option) => {
    const selected = option.dataset.value === value
    option.setAttribute('aria-selected', String(selected))
    option.removeAttribute('hidden')
  })
}

function readPermissionModeValue(root: HTMLElement): ScriptPermissionMode {
  const input = root.querySelector('[data-ref="permission-mode"]') as HTMLInputElement | null
  return input?.value === 'trust' ? 'trust' : 'ask'
}

/** Keep Extension auto-reload aligned with the service Server URL until the user toggles it. */
function syncDevelopModeDefaultFromBaseUrl(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  if (host.developModeTouched) {
    return
  }
  const baseUrlEl = root.querySelector('[data-ref="base-url"]') as HTMLInputElement | null
  const developEl = root.querySelector('[data-ref="develop-mode"]') as HTMLInputElement | null
  if (!baseUrlEl || !developEl) {
    return
  }
  const baseUrl = baseUrlEl.value.trim().replace(/\/$/, '')
  developEl.checked = baseUrl ? defaultDevelopModeForBaseUrl(baseUrl) : false
}

function setScriptKeyBadge(host: MmOptionsDetailFormHost, root: HTMLElement, refCount: number): void {
  host.scriptKeyRefCount = refCount
  updateScriptKeyHint(host, root)
}

export function setDetailMode(host: MmOptionsDetailFormHost, root: HTMLElement, mode: DetailMode): void {
  const emptyEl = root.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
  const formEl = root.querySelector('[data-ref="detail-form"]') as HTMLElement | null
  const bodyEl = root.querySelector('[data-ref="detail-body"]') as HTMLElement | null
  emptyEl?.classList.toggle('hidden', mode !== 'empty')
  formEl?.classList.toggle('hidden', mode === 'empty')
  bodyEl?.classList.toggle('is-empty', mode === 'empty')
  const canDelete = mode === 'edit' && Boolean(host.activeServiceId)
  const deleteBtn = root.querySelector('[data-action="delete-service"]') as HTMLButtonElement | null
  if (deleteBtn) {
    deleteBtn.disabled = !canDelete
  }
  if (mode === 'empty') {
    host.setDetailTestState('idle')
    host.detailFormBaseline = null
    clearAllFieldErrors(root)
  }
  const testConnBtn = root.querySelector('[data-action="test-connection"]') as HTMLButtonElement | null
  if (testConnBtn) {
    testConnBtn.disabled = mode === 'empty' || host.testAllRunning
  }
  if (mode === 'create') {
    host.scriptKeyRevealed = true
  } else if (mode === 'empty') {
    host.scriptKeyStored = ''
    host.scriptKeyRevealed = false
  }
  syncScriptKeyFieldDisplay(host, root)
  if (mode !== 'empty') {
    captureDetailFormBaseline(host, root)
  }
}

function getScriptKeyInput(root: HTMLElement): HTMLInputElement | null {
  return root.querySelector('[data-ref="script-key"]') as HTMLInputElement | null
}

function shouldMaskScriptKey(host: MmOptionsDetailFormHost): boolean {
  return !host.createMode && !host.scriptKeyRevealed
}

function syncScriptKeyFieldDisplay(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  const input = getScriptKeyInput(root)
  const toggleBtn = root.querySelector('[data-action="toggle-script-key"]') as HTMLButtonElement | null
  if (!input) {
    return
  }

  const showToggle = !host.createMode
  toggleBtn?.classList.toggle('hidden', !showToggle)

  if (shouldMaskScriptKey(host)) {
    input.readOnly = true
    input.value = formatScriptKeyMasked(host.scriptKeyStored)
  } else {
    input.readOnly = false
    input.value = host.scriptKeyStored
  }

  updateScriptKeyVisibilityUi(host, root)
}

function updateScriptKeyVisibilityUi(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  const icon = root.querySelector('[data-ref="script-key-visibility-icon"]') as HTMLElement | null
  const btn = root.querySelector('[data-action="toggle-script-key"]') as HTMLButtonElement | null
  if (!icon || !btn || btn.classList.contains('hidden')) {
    return
  }

  const tooltip = host.scriptKeyRevealed ? 'Hide script key' : 'Show script key'
  if (host.scriptKeyRevealed) {
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

export function toggleScriptKeyVisibility(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  if (host.createMode) {
    return
  }
  if (host.scriptKeyRevealed) {
    host.scriptKeyStored = (getScriptKeyInput(root)?.value ?? '').trim()
    host.scriptKeyRevealed = false
  } else {
    host.scriptKeyRevealed = true
  }
  syncScriptKeyFieldDisplay(host, root)
  updateSuggestedServiceFields(host, root)
  if (host.scriptKeyRevealed) {
    const input = getScriptKeyInput(root)
    input?.focus()
    input?.setSelectionRange(input.value.length, input.value.length)
  }
}

function readScriptKeyValue(host: MmOptionsDetailFormHost, root: HTMLElement): string {
  if (shouldMaskScriptKey(host)) {
    return host.scriptKeyStored.trim()
  }
  return (getScriptKeyInput(root)?.value ?? '').trim()
}

export function readFormInput(host: MmOptionsDetailFormHost, root: HTMLElement): DetailFormInput {
  return {
    label: (root.querySelector('[data-ref="label"]') as HTMLInputElement).value.trim(),
    baseUrl: (root.querySelector('[data-ref="base-url"]') as HTMLInputElement).value.trim().replace(/\/$/, ''),
    scriptKey: readScriptKeyValue(host, root),
    gmScope: (root.querySelector('[data-ref="gm-scope"]') as HTMLInputElement).value.trim(),
    permissionMode: readPermissionModeValue(root),
    enabled: (root.querySelector('[data-ref="enabled"]') as HTMLInputElement).checked,
    developMode: (root.querySelector('[data-ref="develop-mode"]') as HTMLInputElement).checked,
  }
}

export function validateFormInput(host: MmOptionsDetailFormHost, root: HTMLElement, input: DetailFormInput): boolean {
  return validateRequiredDetailFields(host, root, input)
}

function getDetailFieldControl(root: HTMLElement, ref: DetailFieldRef): HTMLInputElement | null {
  return root.querySelector(`[data-ref="${ref}"]`) as HTMLInputElement | null
}

function getDetailFieldRoot(root: HTMLElement, ref: DetailFieldRef): HTMLElement | null {
  const input = getDetailFieldControl(root, ref)
  if (!input) {
    return null
  }
  return input.closest('mm-field')
}

export function clearFieldError(root: HTMLElement, ref: DetailFieldRef): void {
  const fieldRoot = getDetailFieldRoot(root, ref)
  fieldRoot?.classList.remove('is-invalid')
  const errorEl = root.querySelector(`[data-ref="${ref}-error"]`) as HTMLElement | null
  if (errorEl) {
    errorEl.textContent = ''
    errorEl.hidden = true
  }
  const input = getDetailFieldControl(root, ref)
  input?.removeAttribute('aria-invalid')
}

export function clearAllFieldErrors(root: HTMLElement): void {
  for (const ref of ['base-url', 'script-key'] as const) {
    clearFieldError(root, ref)
  }
}

function setFieldError(root: HTMLElement, ref: DetailFieldRef, message: string): void {
  const fieldRoot = getDetailFieldRoot(root, ref)
  const errorEl = root.querySelector(`[data-ref="${ref}-error"]`) as HTMLElement | null
  const input = getDetailFieldControl(root, ref)
  fieldRoot?.classList.add('is-invalid')
  if (errorEl) {
    errorEl.textContent = message
    errorEl.hidden = false
  }
  input?.setAttribute('aria-invalid', 'true')
}

function focusDetailField(host: MmOptionsDetailFormHost, root: HTMLElement, ref: DetailFieldRef): void {
  if (ref === 'script-key' && shouldMaskScriptKey(host)) {
    host.scriptKeyRevealed = true
    syncScriptKeyFieldDisplay(host, root)
  }
  const input = getDetailFieldControl(root, ref)
  if (!input) {
    return
  }
  input.focus()
  if (typeof input.select === 'function') {
    input.select()
  }
  getDetailFieldRoot(root, ref)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

export function validateRequiredDetailFields(host: MmOptionsDetailFormHost, root: HTMLElement, input: DetailFormInput): boolean {
  clearAllFieldErrors(root)
  const errors: Array<{ ref: DetailFieldRef; message: string }> = []
  if (!input.baseUrl) {
    errors.push({ ref: 'base-url', message: 'Please enter Server URL.' })
  }
  if (!input.scriptKey) {
    errors.push({ ref: 'script-key', message: 'Please enter Script Key.' })
  }
  for (const error of errors) {
    setFieldError(root, error.ref, error.message)
  }
  if (errors.length > 0) {
    setStatus(root, '', 'idle')
    focusDetailField(host, root, errors[0].ref)
    return false
  }
  return true
}

function currentDetailMode(host: MmOptionsDetailFormHost, root: HTMLElement): DetailMode {
  const emptyEl = root.querySelector('[data-ref="detail-empty"]') as HTMLElement | null
  if (emptyEl && !emptyEl.classList.contains('hidden')) {
    return 'empty'
  }
  return host.createMode ? 'create' : 'edit'
}

export function captureDetailFormBaseline(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  const mode = currentDetailMode(host, root)
  if (mode === 'empty') {
    host.detailFormBaseline = null
    return
  }
  const input = readFormInput(host, root)
  host.detailFormBaseline = {
    mode,
    serviceId: host.activeServiceId,
    ...input,
  }
}

export function hasUnsavedDetailChanges(host: MmOptionsDetailFormHost, root: HTMLElement): boolean {
  const mode = currentDetailMode(host, root)
  if (mode === 'empty') {
    return false
  }
  if (!host.detailFormBaseline) {
    return mode === 'create'
  }
  if (host.detailFormBaseline.mode !== mode || host.detailFormBaseline.serviceId !== host.activeServiceId) {
    return true
  }
  const input = readFormInput(host, root)
  return (
    input.label !== host.detailFormBaseline.label ||
    input.baseUrl !== host.detailFormBaseline.baseUrl ||
    input.scriptKey !== host.detailFormBaseline.scriptKey ||
    input.gmScope !== host.detailFormBaseline.gmScope ||
    input.permissionMode !== host.detailFormBaseline.permissionMode ||
    input.enabled !== host.detailFormBaseline.enabled ||
    input.developMode !== host.detailFormBaseline.developMode
  )
}

/** Prompt when leaving Servers detail with unsaved edits (admin tab router). */
export function confirmDiscardDetailChanges(host: MmOptionsDetailFormHost, root: HTMLElement): boolean {
  if (!hasUnsavedDetailChanges(host, root)) {
    return true
  }
  return window.confirm('Discard unsaved changes to this service?')
}

export function updateScriptKeyHint(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  const hint = root.querySelector('[data-ref="script-key-hint"]') as HTMLElement | null
  const scriptKey = readScriptKeyValue(host, root)
  if (!hint) {
    return
  }
  if (!host.createMode && host.scriptKeyRefCount > 1) {
    hint.textContent = 'Shared capability layer with other services using this script key.'
    return
  }
  if (!scriptKey) {
    hint.textContent = 'Matches /static/[key]/'
    return
  }
  hint.textContent = isValidScriptKeyFormat(scriptKey) ? 'Valid script key format.' : 'Expected 64-character hex (SHA-256 of Gist id).'
}

export function currentDetailModeForHost(host: MmOptionsDetailFormHost, root: HTMLElement): DetailMode {
  return currentDetailMode(host, root)
}

export function syncScriptKeyFieldOnInput(host: MmOptionsDetailFormHost, root: HTMLElement): void {
  if (!shouldMaskScriptKey(host)) {
    host.scriptKeyStored = getScriptKeyInput(root)?.value ?? ''
  }
}
