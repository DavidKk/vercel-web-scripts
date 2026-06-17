import { loadScriptKeyScriptsGroupsFromCache } from '@ext/shared/extension-storage/script-list-cache'
import { navigateExtensionPage } from '@ext/shared/focus-or-open-tab'
import { sendShellMessage } from '@ext/shared/messages'
import { PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE } from '@ext/shell/permission-manager'
import { type ScriptPermissionRequest } from '@shared/script-permission'

import { subscribeAdminViewActivated } from '../admin/mm-admin-view-lifecycle'
import type { mmPopupIcons } from '../mm-icons'
import { hydrateMmIcons, setIconSlotKey } from '../mm-icons'
import { buildScriptsPageScriptUrl } from '../scripts/mm-scripts-hash'
import { formatScriptUpdatedAt } from '../shared/mm-format-relative-time'
import { MmToast } from '../shared/mm-toast'
import {
  buildPermissionDisplayRows,
  groupPermissionRowsByScript,
  isDebugPermissionScriptFile,
  type PermissionDisplayRow,
  type PermissionPolicy,
  type PermissionScriptGroup,
  resolvePermissionPolicy,
} from './permission-display-rows'
import { createMockPermissionRows, getPermissionsDebugOverrides, subscribePermissionsDebug } from './permissions-debug-state'

type PermissionRow = PermissionDisplayRow

/**
 * Admin permissions tab — view and edit script permission entries.
 */
export class MmPermissionsApp extends HTMLElement {
  private bound = false
  private allRows: PermissionRow[] = []
  private scriptNameByKey = new Map<string, string>()
  private loading = false
  private savingRowId: string | null = null
  private savingGroupKey: string | null = null
  private suppressRegistryReload = false
  private unsubscribeAdminView: (() => void) | undefined
  private unsubscribeDebug: (() => void) | undefined
  private registryListener: ((message: unknown) => void) | undefined
  private readonly toast = new MmToast(document)

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.bindEvents()
    hydrateMmIcons(this)
    this.registryListener = (message: unknown): void => {
      if (!message || typeof message !== 'object') {
        return
      }
      const typed = message as { type?: unknown }
      if (typed.type === PERMISSION_REGISTRY_CHANGED_MESSAGE_TYPE) {
        if (this.suppressRegistryReload) {
          return
        }
        void this.reload()
      }
    }
    chrome.runtime.onMessage.addListener(this.registryListener)
    this.unsubscribeDebug = subscribePermissionsDebug(() => {
      void this.reload()
    })
    void this.reload()
    this.unsubscribeAdminView = subscribeAdminViewActivated('permissions', () => {
      void this.reload()
    })
  }

  disconnectedCallback(): void {
    if (this.registryListener) {
      chrome.runtime.onMessage.removeListener(this.registryListener)
      this.registryListener = undefined
    }
    this.unsubscribeAdminView?.()
    this.unsubscribeAdminView = undefined
    this.unsubscribeDebug?.()
    this.unsubscribeDebug = undefined
  }

  private bindEvents(): void {
    this.addEventListener('click', (event) => {
      const scriptLink = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action="open-script"]')
      if (scriptLink) {
        const scriptKey = scriptLink.dataset.scriptKey
        const file = scriptLink.dataset.scriptFile
        if (scriptKey && file) {
          event.preventDefault()
          navigateExtensionPage(buildScriptsPageScriptUrl(scriptKey, file))
        }
      }
    })
    this.addEventListener('change', (event) => {
      const select = (event.target as HTMLElement).closest<HTMLSelectElement>('select[data-permission-field]')
      if (select) {
        const field = select.dataset.permissionField
        if (field === 'group-policy') {
          const groupKey = select.dataset.groupKey
          const policy = select.value as PermissionPolicy
          syncPermissionSelectIcon(select)
          if (groupKey && (policy === 'allow' || policy === 'ask' || policy === 'deny')) {
            void this.applyGroupUpdate(groupKey, policy)
          }
          return
        }
        if (field === 'policy') {
          const rowId = select.dataset.rowId
          syncPermissionSelectIcon(select)
          if (!rowId) {
            return
          }
          void this.applyRowUpdate(rowId, select.value as PermissionPolicy)
        }
        return
      }
      const filter = (event.target as HTMLElement).closest<HTMLInputElement>('[data-ref="policy-filter"]')
      if (filter) {
        this.renderTable()
      }
    })
    this.querySelector('[data-ref="search"]')?.addEventListener('input', () => {
      this.renderTable()
    })
    this.querySelector('[data-action="clear-all"]')?.addEventListener('click', () => {
      void this.clearAllPermissions()
    })
  }

  private getFilterState(): { search: string; policy: 'all' | PermissionPolicy } {
    const search = ((this.querySelector('[data-ref="search"]') as HTMLInputElement | null)?.value ?? '').trim().toLowerCase()
    const policyRaw = (this.querySelector('[data-ref="policy-filter"]') as HTMLInputElement | null)?.value ?? 'all'
    const policy = policyRaw === 'allow' || policyRaw === 'ask' || policyRaw === 'deny' ? policyRaw : 'all'
    return { search, policy }
  }

  private getFilteredRows(): PermissionRow[] {
    const { search, policy } = this.getFilterState()
    return this.allRows.filter((row) => {
      if (policy !== 'all' && row.policy !== policy) {
        return false
      }
      if (!search) {
        return true
      }
      const haystack = [row.scriptKey, row.file, this.resolveScriptName(row.scriptKey, row.file), row.capability, row.resource, row.policy, buildPolicyLabel(row.policy)]
        .join(' ')
        .toLowerCase()
      return haystack.includes(search)
    })
  }

  private async reload(): Promise<void> {
    const debug = getPermissionsDebugOverrides()

    if (debug.forceLoading) {
      this.loading = true
      this.render()
      return
    }

    this.loading = true
    this.render()

    if (debug.forceError !== null) {
      this.loading = false
      this.allRows = []
      this.render()
      return
    }

    if (debug.mockSampleRows) {
      this.loading = false
      this.allRows = createMockPermissionRows().map((row) => {
        const scope = row.scope === 'Always' ? 'persistent' : row.scope === 'This tab' ? 'session' : 'once'
        const decision = row.decision === 'Allow' ? 'allow' : 'deny'
        const request: ScriptPermissionRequest = {
          scriptKey: row.scriptKey,
          file: row.file,
          capability: 'network',
          resource: row.resource,
        }
        return {
          rowId: row.key,
          registryKey: row.key,
          request,
          scriptKey: row.scriptKey,
          file: row.file,
          capability: row.capability,
          resource: row.resource,
          decision,
          scope,
          updatedAt: row.updatedAt,
          policy: resolvePermissionPolicy(scope, decision),
          revocable: row.revocable,
          editable: true,
        }
      })
      this.render()
      return
    }

    if (debug.forceEmpty) {
      this.loading = false
      this.allRows = []
      this.render()
      return
    }

    try {
      await this.loadScriptNameLookup()
      const response = await sendShellMessage({ type: 'GET_SCRIPT_PERMISSION_REGISTRY' })
      if (!response.ok || !('scriptPermissionEntries' in response)) {
        throw new Error(response.ok === false ? response.error : 'Failed to load permissions')
      }
      const registryEntries = response.scriptPermissionEntries ?? []
      const sessionEntries = (response.sessionPermissionEntries ?? []).filter((row) => row.request)
      const historyRows = response.permissionHistoryEntries ?? []
      this.allRows = buildPermissionDisplayRows({
        registryEntries,
        sessionEntries,
        historyEntries: historyRows.map((row) => ({
          id: row.id,
          tabId: row.tabId,
          key: row.key,
          request: row.request,
          decision: row.decision,
          remember: row.remember,
          decidedAt: row.decidedAt,
        })),
      })
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), 'error')
      this.allRows = []
    } finally {
      this.loading = false
      this.render()
    }
  }

  private async loadScriptNameLookup(): Promise<void> {
    try {
      const groups = await loadScriptKeyScriptsGroupsFromCache()
      const next = new Map<string, string>()
      for (const group of groups) {
        for (const script of group.scripts) {
          const name = script.name?.trim() || script.file
          next.set(`${group.scriptKey}:${script.file}`, name)
        }
      }
      this.scriptNameByKey = next
    } catch {
      this.scriptNameByKey = new Map()
    }
  }

  private resolveScriptName(scriptKey: string, file: string): string {
    return this.scriptNameByKey.get(`${scriptKey}:${file}`) ?? file
  }

  private async applyGroupUpdate(groupKey: string, policy: PermissionPolicy): Promise<void> {
    if (this.savingGroupKey === groupKey) {
      return
    }
    const rows = this.allRows.filter((entry) => `${entry.scriptKey}:${entry.file}` === groupKey && entry.editable && entry.policy !== policy)
    if (rows.length === 0) {
      return
    }

    this.savingGroupKey = groupKey
    this.suppressRegistryReload = true
    let success = false
    try {
      const response = await sendShellMessage({
        type: 'UPDATE_SCRIPT_PERMISSION_ENTRIES',
        updates: rows.map((row) => ({
          registryKey: row.registryKey,
          request: row.request,
          scope: 'persistent' as const,
          decision: policy === 'deny' ? 'deny' : 'allow',
          policy,
        })),
      })
      if (!response.ok) {
        throw new Error(response.error)
      }
      success = true
      const message =
        policy === 'ask'
          ? `All permissions for this script set to ask each time. Reload open pages to clear in-page allow cache.`
          : `All permissions for this script set to ${buildPolicyLabel(policy).toLowerCase()}.`
      this.toast.show(message, 'success')
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      this.savingGroupKey = null
      this.suppressRegistryReload = false
    }
    if (success) {
      await this.reload()
    } else {
      this.render()
    }
  }

  private async applyRowUpdate(rowId: string, policy: PermissionPolicy): Promise<void> {
    if (this.savingRowId === rowId) {
      return
    }
    const row = this.allRows.find((entry) => entry.rowId === rowId)
    if (!row || !row.editable) {
      return
    }
    if (row.policy === policy) {
      return
    }

    this.savingRowId = rowId
    try {
      const response = await sendShellMessage({
        type: 'UPDATE_SCRIPT_PERMISSION_ENTRY',
        registryKey: row.registryKey,
        request: row.request,
        scope: 'persistent',
        decision: policy === 'deny' ? 'deny' : 'allow',
        policy,
      })
      if (!response.ok) {
        throw new Error(response.error)
      }
      const message = policy === 'ask' ? 'Permission set to ask each time. Reload open pages to clear in-page allow cache.' : 'Permission updated'
      this.toast.show(message, 'success')
      await this.reload()
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), 'error')
      this.render()
    } finally {
      this.savingRowId = null
    }
  }

  private confirmClearAllPermissions(): boolean {
    return window.confirm(
      'Clear all script permissions?\n\nThis removes persistent grants, tab session grants, and permission history. Reload open pages before testing permission prompts again.\n\nThis cannot be undone.'
    )
  }

  private async clearAllPermissions(): Promise<void> {
    if (!this.confirmClearAllPermissions()) {
      return
    }
    try {
      const response = await sendShellMessage({ type: 'CLEAR_ALL_SCRIPT_PERMISSIONS' })
      if (!response.ok) {
        throw new Error(response.error)
      }
      this.toast.show('All permissions cleared. Reload open pages to reset in-page allow cache.', 'success')
      await this.reload()
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  private render(): void {
    this.renderTable()
  }

  private renderTable(): void {
    const body = this.querySelector<HTMLElement>('[data-ref="body"]')
    const footer = this.querySelector<HTMLElement>('[data-ref="footer"]')
    if (!body) {
      return
    }
    const debug = getPermissionsDebugOverrides()
    const setFooter = (text: string | null): void => {
      if (!footer) {
        return
      }
      if (!text) {
        footer.textContent = ''
        footer.classList.add('hidden')
        return
      }
      footer.textContent = text
      footer.classList.remove('hidden')
    }
    if (debug.forceError !== null) {
      body.innerHTML = `<p class="mm-permissions-empty">${escapeHtml(debug.forceError || debug.errorMessage)}</p>`
      setFooter(null)
      return
    }
    if (this.loading) {
      body.innerHTML = '<p class="mm-permissions-empty">Loading…</p>'
      setFooter(null)
      return
    }
    if (this.allRows.length === 0) {
      body.innerHTML = `<p class="mm-permissions-empty">${escapeHtml('No permission history yet. Modal allow/deny decisions will appear here.')}</p>`
      setFooter('No permission entries')
      return
    }
    const visibleRows = this.getFilteredRows()
    if (visibleRows.length === 0) {
      body.innerHTML = `<p class="mm-permissions-empty">${escapeHtml('No permissions match the current filters.')}</p>`
      setFooter(`0 / ${this.allRows.length} entries`)
      return
    }
    const scriptGroups = groupPermissionRowsByScript(visibleRows, this.scriptNameByKey)
    const list = document.createElement('div')
    list.className = 'mm-permissions-cards'
    list.setAttribute('role', 'list')
    for (const group of scriptGroups) {
      list.append(buildPermissionCard(group))
    }
    const shell = document.createElement('div')
    shell.className = 'mm-permissions-list-shell'
    shell.appendChild(list)
    body.replaceChildren(shell)
    hydrateMmIcons(body)
    setFooter(`Showing ${visibleRows.length} permissions across ${scriptGroups.length} scripts`)
  }
}

function buildPermissionCard(group: PermissionScriptGroup): HTMLElement {
  const article = document.createElement('article')
  article.className = 'mm-permissions-card'
  article.setAttribute('role', 'listitem')
  if (isDebugPermissionScriptFile(group.file)) {
    article.classList.add('mm-permissions-card--debug')
  }

  const header = document.createElement('header')
  header.className = 'mm-permissions-card-head'
  const groupPolicy = buildGroupPolicySelect(group)
  header.innerHTML = `
    <div class="mm-permissions-card-head-main">
      <span class="mm-permissions-index" aria-hidden="true">${group.index}</span>
      ${buildScriptCell(group)}
    </div>
    ${
      groupPolicy
        ? `<div class="mm-permissions-card-head-policy">
            ${groupPolicy}
          </div>`
        : ''
    }
  `

  const items = document.createElement('div')
  items.className = 'mm-permissions-card-items'
  items.innerHTML = `
    <div class="mm-permissions-item-head" aria-hidden="true">
      <span class="mm-permissions-item-capability">Capability</span>
      <span class="mm-permissions-item-resource">Resource</span>
      <span class="mm-permissions-item-updated">Updated</span>
      <span class="mm-permissions-item-policy">Policy</span>
    </div>
  `
  for (const row of group.rows) {
    const permRow = document.createElement('div')
    permRow.className = 'mm-permissions-item'
    permRow.innerHTML = `
      <span class="mm-permissions-item-capability">${escapeHtml(row.capability)}</span>
      <span class="mm-permissions-item-resource"><code class="mm-permissions-resource">${escapeHtml(row.resource)}</code></span>
      <span class="mm-permissions-item-updated">${escapeHtml(formatScriptUpdatedAt(row.updatedAt))}</span>
      <span class="mm-permissions-item-policy">${buildPolicyCell(row)}</span>
    `
    items.appendChild(permRow)
  }

  article.append(header, items)
  return article
}

function buildScriptCell(group: PermissionScriptGroup): string {
  const showSeparateFile = group.scriptName.trim().toLowerCase() !== group.file.trim().toLowerCase()
  const debugBadge = isDebugPermissionScriptFile(group.file) ? '<span class="mm-permissions-debug-badge">Debug</span>' : ''
  if (!showSeparateFile) {
    return `<div class="mm-permissions-script-cell"><div class="mm-permissions-script-copy">${buildScriptFileLink(group.scriptKey, group.file, group.scriptName)}${debugBadge}</div></div>`
  }
  const nameRow = `<div class="mm-permissions-script-name-row"><span class="mm-permissions-script-name">${escapeHtml(group.scriptName)}</span>${debugBadge}</div>`
  const fileHtml = buildScriptFileLink(group.scriptKey, group.file)
  return `<div class="mm-permissions-script-cell"><div class="mm-permissions-script-copy mm-permissions-script-copy--stacked">${nameRow}${fileHtml}</div></div>`
}

function buildScriptFileLink(scriptKey: string, file: string, label = file): string {
  const className = `mm-permissions-script-file${label === file ? '' : ' mm-permissions-script-file--primary'}`
  if (isDebugPermissionScriptFile(file)) {
    return `<span class="${className} mm-permissions-script-file--static">${escapeHtml(label)}</span>`
  }
  return `<button type="button" class="${className}" data-action="open-script" data-script-key="${escapeAttr(scriptKey)}" data-script-file="${escapeAttr(file)}" title="Open in Scripts">${escapeHtml(label)}</button>`
}

function buildGroupPolicySelect(group: PermissionScriptGroup): string {
  const editableRows = group.rows.filter((row) => row.editable)
  if (editableRows.length === 0) {
    return ''
  }
  const policies = new Set(editableRows.map((row) => row.policy))
  const sharedPolicy = policies.size === 1 ? editableRows[0]?.policy : null
  const placeholder = sharedPolicy === null ? '<option value="" selected>Mixed</option>' : ''
  const options = (['allow', 'ask', 'deny'] as const)
    .map((value) => {
      const selected = sharedPolicy === value ? ' selected' : ''
      return `<option value="${value}"${selected}>${escapeHtml(buildPolicyLabel(value))}</option>`
    })
    .join('')
  return buildPolicySelectWrap(
    `<select class="mm-native-select mm-permissions-select mm-permissions-select--group" data-permission-field="group-policy" data-group-key="${escapeAttr(group.groupKey)}" data-policy="${escapeAttr(sharedPolicy ?? 'mixed')}" aria-label="Set all permissions for ${escapeAttr(group.scriptName)}">${placeholder}${options}</select>`,
    policyIconKey(sharedPolicy),
    sharedPolicy ?? 'mixed'
  )
}

function buildPolicyCell(row: PermissionRow): string {
  if (!row.editable) {
    return `<span class="mm-permissions-policy-label">${escapeHtml(buildPolicyLabel(row.policy))}</span>`
  }
  return buildPolicySelect(row)
}

function buildPolicySelect(row: PermissionRow): string {
  const options = (['allow', 'ask', 'deny'] as const)
    .map((value) => {
      const selected = row.policy === value ? ' selected' : ''
      return `<option value="${value}"${selected}>${escapeHtml(buildPolicyLabel(value))}</option>`
    })
    .join('')
  return buildPolicySelectWrap(
    `<select class="mm-native-select mm-permissions-select mm-permissions-select--policy" data-permission-field="policy" data-policy="${escapeAttr(row.policy)}" data-row-id="${escapeAttr(row.rowId)}" aria-label="Permission policy">${options}</select>`,
    policyIconKey(row.policy),
    row.policy
  )
}

type PermissionIconKey = keyof typeof mmPopupIcons

function policyIconKey(policy: PermissionPolicy | null): PermissionIconKey {
  if (policy === 'allow') {
    return 'permissionAllow'
  }
  if (policy === 'deny') {
    return 'permissionDeny'
  }
  if (policy === 'ask') {
    return 'permissionAsk'
  }
  return 'permissionMixed'
}

function buildPolicySelectWrap(selectHtml: string, iconKey: PermissionIconKey, policy: PermissionPolicy | 'mixed'): string {
  return `<span class="mm-permissions-select-wrap" data-policy="${escapeAttr(policy)}">
    <span class="mm-permissions-select-icon mm-icon-slot" data-icon="${iconKey}" aria-hidden="true"></span>
    ${selectHtml}
  </span>`
}

function syncPermissionSelectIcon(select: HTMLSelectElement): void {
  const wrap = select.closest('.mm-permissions-select-wrap')
  const icon = wrap?.querySelector<HTMLElement>('.mm-permissions-select-icon')
  if (!wrap || !icon) {
    return
  }
  const value = select.value
  if (value === 'allow' || value === 'ask' || value === 'deny') {
    setIconSlotKey(icon, policyIconKey(value))
    wrap.setAttribute('data-policy', value)
    select.setAttribute('data-policy', value)
    return
  }
  setIconSlotKey(icon, 'permissionMixed')
  wrap.setAttribute('data-policy', 'mixed')
  select.setAttribute('data-policy', 'mixed')
}

function buildPolicyLabel(policy: PermissionPolicy): string {
  if (policy === 'allow') {
    return 'Allow'
  }
  if (policy === 'deny') {
    return 'Deny'
  }
  return 'Ask each time'
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}
