import type { DebugLogEntry, DebugLogLevel, DebugLogPortMessage, DebugLogSource } from '@ext/shared/debug-log-types'
import { DEBUG_LOG_PORT_APPEND, DEBUG_LOG_PORT_NAME, DEBUG_LOG_PORT_SNAPSHOT, MAX_DEBUG_LOG_ENTRIES } from '@ext/shared/debug-log-types'
import { getIncognitoLogCollectionEnabled, setIncognitoLogCollectionEnabled } from '@ext/shared/extension-storage'
import { focusTabById } from '@ext/shared/focus-or-open-tab'
import { sendShellMessage } from '@ext/shared/messages'
import { getCachedShellLogOutputMode, setCachedIncognitoLogCollection } from '@ext/shared/shell-log-output-cache'

import { subscribeAdminViewActivated } from '../admin/mm-admin-view-lifecycle'
import type { MmSearchSelect } from '../mm-form-components/mm-search-select'
import { bindScrollIndicator } from '../mm-form-components/scroll-indicator'
import { hydrateMmIcons } from '../mm-icons'
import { MmToast } from '../shared/mm-toast'
import { initMmTooltipDelegation } from '../shared/mm-tooltip'
import { createMockDebugLogEntries, getLogsDebugOverrides, subscribeLogsDebug } from './logs-debug-state'
import {
  canDeselectDebugLogLevel,
  type DebugLogsIncognitoFilter,
  DEFAULT_DEBUG_LOG_LEVEL_FILTER,
  filterDebugLogEntries,
  formatDebugLogsFooterText,
  formatDebugLogsForClipboard,
  getDebugLogsEmptyMessage,
  hasActiveDebugLogFilters,
} from './mm-logs-filter'

const ALL_SOURCES: DebugLogSource[] = ['background', 'popup', 'admin', 'content', 'inject', 'page']
const PORT_RECONNECT_MS = 500

type LogsQuickFilter = 'source' | 'scope' | 'host' | 'tab'

/**
 * Admin logs tab — session debug log viewer (background ring buffer).
 */
export class MmLogsApp extends HTMLElement {
  private bound = false
  private entries: DebugLogEntry[] = []
  private port: chrome.runtime.Port | undefined
  private autoScroll = true
  private levelFilter = new Set<DebugLogLevel>(DEFAULT_DEBUG_LOG_LEVEL_FILTER)
  private search = ''
  private unsubscribeAdminView: (() => void) | undefined
  private scrollIndicatorRefresh: (() => void) | undefined
  private portReconnectTimer: ReturnType<typeof setTimeout> | undefined
  private lastSourceOptionsKey = ''
  private lastScopeOptionsKey = ''
  private lastHostOptionsKey = ''
  private lastTabOptionsKey = ''
  private incognitoCollectionEnabled = false
  private unsubscribeDebug: (() => void) | undefined
  private readonly toast = new MmToast(document)

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    hydrateMmIcons(this)
    initMmTooltipDelegation(this)
    this.syncLevelFilterUi()
    this.syncFollowToggleUi()
    this.initIncognitoFilterSelect()
    this.bindEvents()
    this.bindScrollIndicator()
    this.unsubscribeDebug = subscribeLogsDebug(() => this.flushViewUpdate())
    void this.syncIncognitoCollectionFromBackground()
    void this.refreshFromBackground()
    this.connectPort()
    this.unsubscribeAdminView = subscribeAdminViewActivated('logs', () => {
      void this.refreshFromBackground()
      if (!this.port) {
        this.connectPort()
      }
    })
  }

  disconnectedCallback(): void {
    this.unsubscribeDebug?.()
    this.unsubscribeDebug = undefined
    this.unsubscribeAdminView?.()
    this.unsubscribeAdminView = undefined
    this.clearPortReconnectTimer()
    this.port?.disconnect()
    this.port = undefined
  }

  private syncLevelFilterUi(): void {
    this.querySelectorAll<HTMLButtonElement>('.mm-logs-level-chip[data-level]').forEach((btn) => {
      const level = btn.dataset.level as DebugLogLevel
      btn.setAttribute('aria-pressed', this.levelFilter.has(level) ? 'true' : 'false')
    })
  }

  private syncFollowToggleUi(): void {
    const btn = this.querySelector<HTMLButtonElement>('[data-ref="follow-toggle"]')
    if (!btn) {
      return
    }
    btn.setAttribute('aria-pressed', this.autoScroll ? 'true' : 'false')
    btn.setAttribute('data-mm-tooltip', this.autoScroll ? 'Auto-scroll to newest entries' : 'Paused — click to follow new entries')
  }

  private bindEvents(): void {
    this.querySelector('[data-ref="level-filters"]')?.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('.mm-logs-level-chip[data-level]')
      if (!btn) {
        return
      }
      const level = btn.dataset.level as DebugLogLevel
      const pressed = btn.getAttribute('aria-pressed') === 'true'
      const next = !pressed
      if (!next && !canDeselectDebugLogLevel(this.levelFilter, level)) {
        return
      }
      btn.setAttribute('aria-pressed', next ? 'true' : 'false')
      if (next) {
        this.levelFilter.add(level)
      } else {
        this.levelFilter.delete(level)
      }
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="search"]')?.addEventListener('input', (event) => {
      this.search = (event.target as HTMLInputElement).value.trim().toLowerCase()
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="source-select"]')?.addEventListener('mm-search-select-change', () => {
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="scope-select"]')?.addEventListener('mm-search-select-change', () => {
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="host-select"]')?.addEventListener('mm-search-select-change', () => {
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="tab-select"]')?.addEventListener('mm-search-select-change', () => {
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="incognito-select"]')?.addEventListener('mm-search-select-change', () => {
      this.renderList()
      this.renderFooter()
    })
    this.querySelector('[data-ref="follow-toggle"]')?.addEventListener('click', (event) => {
      const btn = event.currentTarget as HTMLButtonElement
      this.autoScroll = btn.getAttribute('aria-pressed') !== 'true'
      this.syncFollowToggleUi()
      if (this.autoScroll) {
        const list = this.querySelector('[data-ref="list"]') as HTMLElement | null
        if (list) {
          list.scrollTop = list.scrollHeight
        }
      }
    })
    this.querySelector('[data-action="clear-filters"]')?.addEventListener('click', () => {
      this.clearFilters()
    })
    this.querySelector('[data-action="copy-logs"]')?.addEventListener('click', () => {
      void this.copyAllLogs()
    })
    this.querySelector('[data-action="clear-logs"]')?.addEventListener('click', () => {
      void this.clearAllLogs()
    })
    this.querySelector('[data-ref="incognito-collect-toggle"]')?.addEventListener('click', () => {
      void this.toggleIncognitoCollection()
    })
    this.querySelector('[data-ref="rows"]')?.addEventListener('click', (event) => {
      void this.handleListClick(event)
    })
  }

  private handleListClick(event: Event): void {
    const mouseEvent = event as MouseEvent
    const tabFilterBtn = (event.target as HTMLElement).closest('[data-action="quick-filter"][data-filter="tab"]') as HTMLElement | null
    if (tabFilterBtn && (mouseEvent.metaKey || mouseEvent.ctrlKey)) {
      event.preventDefault()
      void this.focusTabFromQuickFilter(tabFilterBtn)
      return
    }
    const filterBtn = (event.target as HTMLElement).closest('[data-action="quick-filter"]') as HTMLElement | null
    if (filterBtn) {
      event.preventDefault()
      const filter = filterBtn.dataset.filter as LogsQuickFilter | undefined
      const value = filterBtn.dataset.value ?? ''
      if (filter && value) {
        this.applyQuickFilter(filter, value)
      }
    }
  }

  private applyQuickFilter(filter: LogsQuickFilter, value: string): void {
    const select = filter === 'source' ? this.getSourceSelect() : filter === 'scope' ? this.getScopeSelect() : filter === 'host' ? this.getHostSelect() : this.getTabSelect()
    if (!select) {
      return
    }
    select.setValue(value)
    this.renderList()
    this.renderFooter()
  }

  private async focusTabFromQuickFilter(target: HTMLElement): Promise<void> {
    const tabId = Number(target.dataset.value)
    if (!Number.isFinite(tabId)) {
      return
    }
    const focused = await focusTabById(tabId)
    if (!focused) {
      this.toast.show(`Tab ${tabId} is no longer available.`, 'warn')
    }
  }

  private bindScrollIndicator(): void {
    const list = this.querySelector('[data-ref="list"]') as HTMLElement | null
    if (!list) {
      return
    }
    this.scrollIndicatorRefresh = bindScrollIndicator(list)
  }

  private async refreshFromBackground(): Promise<void> {
    const response = await sendShellMessage({ type: 'GET_DEBUG_LOGS' })
    if (response.ok && 'debugLogs' in response && response.debugLogs) {
      this.entries = response.debugLogs
      this.syncFilterSelectOptions()
      this.renderList()
      this.renderFooter()
    }
  }

  private async syncIncognitoCollectionFromBackground(): Promise<void> {
    try {
      this.incognitoCollectionEnabled = await getIncognitoLogCollectionEnabled()
      setCachedIncognitoLogCollection(this.incognitoCollectionEnabled)
      this.syncIncognitoCollectToggleUi()
    } catch {
      // ignore storage read errors
    }
  }

  private syncIncognitoCollectToggleUi(): void {
    const btn = this.querySelector<HTMLButtonElement>('[data-ref="incognito-collect-toggle"]')
    if (!btn) {
      return
    }
    btn.setAttribute('aria-pressed', this.incognitoCollectionEnabled ? 'true' : 'false')
    btn.setAttribute('data-mm-tooltip', this.incognitoCollectionEnabled ? 'Collecting incognito tab logs' : 'Incognito tab logs are not collected (click to enable)')
  }

  private async toggleIncognitoCollection(): Promise<void> {
    const next = !this.incognitoCollectionEnabled
    try {
      await setIncognitoLogCollectionEnabled(next)
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Failed to update incognito log collection.', 'warn')
      return
    }
    this.incognitoCollectionEnabled = next
    setCachedIncognitoLogCollection(next)
    this.syncIncognitoCollectToggleUi()
    this.renderFooter()
    this.toast.show(next ? 'Incognito tab logs will be collected.' : 'Incognito tab logs will no longer be collected.', 'success')
  }

  private initIncognitoFilterSelect(): void {
    const select = this.getIncognitoSelect()
    if (!select) {
      return
    }
    select.setOptions([
      { value: '', label: 'All contexts' },
      { value: 'normal', label: 'Normal only' },
      { value: 'incognito', label: 'Incognito only' },
    ])
    select.setValue('')
  }

  private connectPort(): void {
    if (this.port) {
      return
    }
    this.port = chrome.runtime.connect({ name: DEBUG_LOG_PORT_NAME })
    this.port.onMessage.addListener((message: DebugLogPortMessage) => {
      if (message.type === DEBUG_LOG_PORT_SNAPSHOT) {
        this.entries = message.entries
        this.flushViewUpdate()
        return
      }
      if (message.type === DEBUG_LOG_PORT_APPEND) {
        this.entries.push(...message.entries)
        while (this.entries.length > MAX_DEBUG_LOG_ENTRIES) {
          this.entries.shift()
        }
        this.flushViewUpdate()
      }
    })
    this.port.onDisconnect.addListener(() => {
      this.port = undefined
      if (this.isConnected) {
        this.schedulePortReconnect()
      }
    })
  }

  private schedulePortReconnect(): void {
    if (this.portReconnectTimer) {
      return
    }
    this.portReconnectTimer = setTimeout(() => {
      this.portReconnectTimer = undefined
      if (!this.isConnected || this.port) {
        return
      }
      void this.refreshFromBackground()
      this.connectPort()
    }, PORT_RECONNECT_MS)
  }

  private clearPortReconnectTimer(): void {
    if (this.portReconnectTimer) {
      clearTimeout(this.portReconnectTimer)
      this.portReconnectTimer = undefined
    }
  }

  private flushViewUpdate(): void {
    this.syncFilterSelectOptions()
    this.renderList()
    this.renderFooter()
  }

  private getHostSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="host-select"]') as MmSearchSelect | null
  }

  private getSourceSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="source-select"]') as MmSearchSelect | null
  }

  private getTabSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="tab-select"]') as MmSearchSelect | null
  }

  private getIncognitoSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="incognito-select"]') as MmSearchSelect | null
  }

  private getScopeSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="scope-select"]') as MmSearchSelect | null
  }

  private syncFilterSelectOptions(): void {
    const entries = this.getDisplayEntries()
    this.syncSourceSelectOptions(entries)
    this.syncScopeSelectOptions(entries)
    this.syncHostSelectOptions(entries)
    this.syncTabSelectOptions(entries)
  }

  private syncSourceSelectOptions(entries: DebugLogEntry[] = this.getDisplayEntries()): void {
    const select = this.getSourceSelect()
    if (!select) {
      return
    }
    const sources = [...new Set(entries.map((entry) => entry.source).filter((source): source is DebugLogSource => ALL_SOURCES.includes(source)))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
    const optionsKey = sources.join('\0')
    if (optionsKey === this.lastSourceOptionsKey) {
      return
    }
    this.lastSourceOptionsKey = optionsKey
    const current = select.getValue()
    const next = current && !sources.includes(current as DebugLogSource) ? '' : current
    select.setOptions([{ value: '', label: 'All sources' }, ...sources.map((source) => ({ value: source, label: this.formatSourceLabel(source) }))])
    select.setValue(next)
  }

  private syncHostSelectOptions(entries: DebugLogEntry[] = this.getDisplayEntries()): void {
    const select = this.getHostSelect()
    if (!select) {
      return
    }
    const hosts = [...new Set(entries.map((entry) => entry.meta?.host?.trim()).filter((host): host is string => Boolean(host)))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
    const optionsKey = hosts.join('\0')
    if (optionsKey === this.lastHostOptionsKey) {
      return
    }
    this.lastHostOptionsKey = optionsKey
    const current = select.getValue()
    const next = current && !hosts.includes(current) ? '' : current
    select.setOptions([{ value: '', label: 'All hosts' }, ...hosts.map((host) => ({ value: host, label: host }))])
    select.setValue(next)
  }

  private syncScopeSelectOptions(entries: DebugLogEntry[] = this.getDisplayEntries()): void {
    const select = this.getScopeSelect()
    if (!select) {
      return
    }
    const scopes = [...new Set(entries.map((entry) => entry.scope?.trim()).filter((scope): scope is string => Boolean(scope)))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
    const optionsKey = scopes.join('\0')
    if (optionsKey === this.lastScopeOptionsKey) {
      return
    }
    this.lastScopeOptionsKey = optionsKey
    const current = select.getValue()
    const next = current && !scopes.includes(current) ? '' : current
    select.setOptions([{ value: '', label: 'All scopes' }, ...scopes.map((scope) => ({ value: scope, label: scope }))])
    select.setValue(next)
  }

  private syncTabSelectOptions(entries: DebugLogEntry[] = this.getDisplayEntries()): void {
    const select = this.getTabSelect()
    if (!select) {
      return
    }
    const tabIds = [...new Set(entries.filter((entry) => entry.meta?.tabId != null).map((entry) => String(entry.meta!.tabId)))].sort((a, b) => Number(a) - Number(b))
    const optionsKey = tabIds.join('\0')
    if (optionsKey === this.lastTabOptionsKey) {
      return
    }
    this.lastTabOptionsKey = optionsKey
    const current = select.getValue()
    const next = current && !tabIds.includes(current) ? '' : current
    select.setOptions([{ value: '', label: 'All tabs' }, ...tabIds.map((tabId) => ({ value: tabId, label: tabId }))])
    select.setValue(next)
  }

  private getFilterCriteria() {
    return {
      levelFilter: this.levelFilter,
      sourceFilter: this.getSourceSelect()?.getValue() ?? '',
      scopeFilter: this.getScopeSelect()?.getValue() ?? '',
      hostFilter: this.getHostSelect()?.getValue() ?? '',
      tabFilter: this.getTabSelect()?.getValue() ?? '',
      incognitoFilter: (this.getIncognitoSelect()?.getValue() ?? '') as DebugLogsIncognitoFilter,
      search: this.search,
    }
  }

  private getDisplayEntries(): DebugLogEntry[] {
    const debug = getLogsDebugOverrides()
    if (debug.forceEmpty) {
      return []
    }
    if (debug.mockSampleEntries) {
      return [...createMockDebugLogEntries(), ...this.entries]
    }
    return this.entries
  }

  private getFilteredEntries(): DebugLogEntry[] {
    return filterDebugLogEntries(this.getDisplayEntries(), this.getFilterCriteria())
  }

  private syncCopyLogsTooltipUi(): void {
    const btn = this.querySelector<HTMLButtonElement>('[data-action="copy-logs"]')
    if (!btn) {
      return
    }
    const criteria = this.getFilterCriteria()
    if (hasActiveDebugLogFilters(criteria)) {
      const filteredCount = this.getFilteredEntries().length
      btn.setAttribute('data-mm-tooltip', `Copy ${filteredCount} filtered log entries to clipboard (TSV)`)
      return
    }
    btn.setAttribute('data-mm-tooltip', `Copy all ${this.getDisplayEntries().length} session log entries to clipboard (TSV)`)
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp)
    return date.toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  /** Full timestamp for time-cell hover tooltip (YYYY-MM-DD HH:mm:ss.SSS). */
  private formatTimeFull(timestamp: number): string {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) {
      return '—'
    }
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    const s = String(date.getSeconds()).padStart(2, '0')
    const ms = String(date.getMilliseconds()).padStart(3, '0')
    return `${y}-${m}-${d} ${h}:${min}:${s}.${ms}`
  }

  private formatSourceLabel(source: DebugLogSource): string {
    return source.charAt(0).toUpperCase() + source.slice(1)
  }

  private renderQuickFilterCell(className: string, filter: LogsQuickFilter, value: string, display: string, tooltip?: string): string {
    const trimmed = value.trim()
    if (!trimmed || trimmed === '—') {
      return `<span class="mm-logs-cell ${className}">${this.escapeHtml(display)}</span>`
    }
    const filterTooltip = tooltip ?? `Filter by ${display}`
    const wide = filter === 'tab' ? ' data-mm-tooltip-wide' : ''
    return `<button type="button" class="mm-logs-cell ${className} mm-logs-cell--filter-link" data-action="quick-filter" data-filter="${filter}" data-value="${this.escapeAttr(trimmed)}" data-mm-tooltip="${this.escapeAttr(filterTooltip)}" data-mm-tooltip-placement="bottom"${wide}>${this.escapeHtml(display)}</button>`
  }

  private renderTabCell(entry: DebugLogEntry): string {
    const tabId = entry.meta?.tabId != null ? String(entry.meta.tabId) : '—'
    if (entry.meta?.tabId == null) {
      return `<span class="mm-logs-cell mm-logs-cell--tab" role="gridcell">${this.escapeHtml(tabId)}</span>`
    }
    const filterTooltip = `Filter by tab ${tabId} (⌘/Ctrl+click to focus tab)`
    const tabLink = `<button type="button" class="mm-logs-cell mm-logs-cell--tab mm-logs-cell--tab-link mm-logs-cell--filter-link" role="gridcell" data-action="quick-filter" data-filter="tab" data-value="${this.escapeAttr(tabId)}" data-mm-tooltip="${this.escapeAttr(filterTooltip)}" data-mm-tooltip-placement="bottom" data-mm-tooltip-wide>${this.escapeHtml(tabId)}</button>`
    if (entry.meta?.incognito !== true) {
      return tabLink
    }
    return `<span class="mm-logs-cell mm-logs-cell--tab mm-logs-cell--tab-row" role="gridcell">${tabLink}<span class="mm-logs-tab-incognito-badge" data-mm-tooltip="Incognito tab" data-mm-tooltip-placement="bottom" aria-label="Incognito tab"><span data-icon="eyeOff" class="mm-icon-slot mm-logs-tab-incognito-icon" aria-hidden="true"></span></span></span>`
  }

  private renderList(): void {
    const rowsRoot = this.querySelector('[data-ref="rows"]') as HTMLElement | null
    const list = this.querySelector('[data-ref="list"]') as HTMLElement | null
    if (!rowsRoot || !list) {
      return
    }
    const debug = getLogsDebugOverrides()
    if (debug.forceLoading) {
      rowsRoot.classList.add('mm-logs-rows--empty')
      rowsRoot.innerHTML = `<div class="mm-logs-empty">Loading logs…</div>`
      this.scrollIndicatorRefresh?.()
      return
    }
    if (debug.forceError !== null) {
      rowsRoot.classList.add('mm-logs-rows--empty')
      const message = debug.forceError || debug.errorMessage
      rowsRoot.innerHTML = `<div class="mm-logs-empty mm-logs-error">${this.escapeHtml(message)}</div>`
      this.scrollIndicatorRefresh?.()
      return
    }
    const displayEntries = this.getDisplayEntries()
    const rows = this.getFilteredEntries()
    if (rows.length === 0) {
      rowsRoot.classList.add('mm-logs-rows--empty')
      rowsRoot.innerHTML = `<div class="mm-logs-empty">${this.escapeHtml(getDebugLogsEmptyMessage(displayEntries.length))}</div>`
      this.scrollIndicatorRefresh?.()
      return
    }
    rowsRoot.classList.remove('mm-logs-rows--empty')
    rowsRoot.innerHTML = rows
      .map((entry) => {
        const host = entry.meta?.host?.trim() ?? '—'
        return `<div class="mm-logs-row mm-logs-row--${entry.level}" role="row">
          <span class="mm-logs-cell mm-logs-cell--time" data-mm-tooltip="${this.escapeAttr(this.formatTimeFull(entry.t))}" data-mm-tooltip-placement="bottom" data-mm-tooltip-align="center" data-mm-tooltip-wide role="gridcell">${this.formatTime(entry.t)}</span>
          <span class="mm-logs-cell mm-logs-cell--level" data-level="${entry.level}" data-mm-tooltip="${this.escapeAttr(`${entry.level} level`)}" data-mm-tooltip-placement="bottom" role="gridcell">${entry.level}</span>
          ${this.renderQuickFilterCell('mm-logs-cell--source', 'source', entry.source, entry.source, `Filter by source ${entry.source}`)}
          ${this.renderQuickFilterCell('mm-logs-cell--scope', 'scope', entry.scope, entry.scope, `Filter by scope ${entry.scope.trim()}`)}
          ${this.renderQuickFilterCell('mm-logs-cell--host', 'host', host === '—' ? '' : host, host, host === '—' ? undefined : `Filter by host ${host}`)}
          ${this.renderTabCell(entry)}
          <span class="mm-logs-cell mm-logs-cell--message" role="gridcell">${this.escapeHtml(entry.message)}</span>
        </div>`
      })
      .join('')
    if (this.autoScroll) {
      list.scrollTop = list.scrollHeight
    }
    hydrateMmIcons(rowsRoot)
    this.scrollIndicatorRefresh?.()
  }

  private renderFooter(): void {
    const footer = this.querySelector('[data-ref="footer"]') as HTMLElement | null
    if (!footer) {
      return
    }
    const filteredCount = this.getFilteredEntries().length
    const totalCount = this.getDisplayEntries().length
    const mode = getCachedShellLogOutputMode()
    footer.textContent = formatDebugLogsFooterText({
      filteredCount,
      totalCount,
      maxEntries: MAX_DEBUG_LOG_ENTRIES,
      logMode: mode,
      incognitoCollection: this.incognitoCollectionEnabled,
    })
    this.syncCopyLogsTooltipUi()
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  private escapeAttr(value: string): string {
    return this.escapeHtml(value).replace(/"/g, '&quot;')
  }

  private clearFilters(): void {
    this.levelFilter = new Set<DebugLogLevel>(DEFAULT_DEBUG_LOG_LEVEL_FILTER)
    this.syncLevelFilterUi()
    this.search = ''
    const searchInput = this.querySelector('[data-ref="search"]') as HTMLInputElement | null
    if (searchInput) {
      searchInput.value = ''
    }
    this.getSourceSelect()?.setValue('')
    this.getScopeSelect()?.setValue('')
    this.getHostSelect()?.setValue('')
    this.getTabSelect()?.setValue('')
    this.getIncognitoSelect()?.setValue('')
    this.renderList()
    this.renderFooter()
  }

  private async copyAllLogs(): Promise<void> {
    const debug = getLogsDebugOverrides()
    if (debug.forceLoading) {
      this.toast.show('Logs are still loading.', 'warn')
      return
    }
    if (debug.forceError !== null) {
      this.toast.show('Cannot copy logs while the error override is active.', 'warn')
      return
    }
    const criteria = this.getFilterCriteria()
    const filtersActive = hasActiveDebugLogFilters(criteria)
    const displayEntries = this.getDisplayEntries()
    const entriesToCopy = filtersActive ? this.getFilteredEntries() : displayEntries
    if (entriesToCopy.length === 0) {
      this.toast.show(filtersActive ? 'No filtered logs to copy.' : 'No logs to copy.', 'warn')
      return
    }
    const text = formatDebugLogsForClipboard(entriesToCopy)
    try {
      await navigator.clipboard.writeText(text)
      if (filtersActive && entriesToCopy.length !== displayEntries.length) {
        this.toast.show(`Copied ${entriesToCopy.length} filtered entries (${displayEntries.length} in session).`, 'success')
      } else {
        this.toast.show(`Copied ${entriesToCopy.length} log entries.`, 'success')
      }
    } catch {
      this.toast.show('Failed to copy logs to clipboard.', 'warn')
    }
  }

  private async clearAllLogs(): Promise<void> {
    const response = await sendShellMessage({ type: 'CLEAR_DEBUG_LOGS' })
    if (!response.ok) {
      this.toast.show('error' in response ? response.error : 'Failed to clear logs.', 'warn')
      return
    }
    this.entries = []
    this.lastSourceOptionsKey = ''
    this.lastScopeOptionsKey = ''
    this.lastHostOptionsKey = ''
    this.lastTabOptionsKey = ''
    this.syncFilterSelectOptions()
    this.renderList()
    this.renderFooter()
    this.toast.show('Session logs cleared.', 'success')
  }
}
