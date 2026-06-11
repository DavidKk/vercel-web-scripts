import type { DebugLogEntry, DebugLogLevel, DebugLogPortMessage, DebugLogSource } from '@ext/shared/debug-log-types'
import { DEBUG_LOG_PORT_APPEND, DEBUG_LOG_PORT_NAME, DEBUG_LOG_PORT_SNAPSHOT, MAX_DEBUG_LOG_ENTRIES } from '@ext/shared/debug-log-types'
import { focusTabById } from '@ext/shared/focus-or-open-tab'
import { sendShellMessage } from '@ext/shared/messages'
import { getCachedShellLogOutputMode } from '@ext/shared/shell-log-output-cache'

import { subscribeAdminViewActivated } from './mm-admin-view-lifecycle'
import type { MmSearchSelect } from './mm-form-components/mm-search-select'
import { bindScrollIndicator } from './mm-form-components/scroll-indicator'
import { hydrateMmIcons } from './mm-icons'
import { canDeselectDebugLogLevel, DEFAULT_DEBUG_LOG_LEVEL_FILTER, filterDebugLogEntries, formatDebugLogsFooterText, getDebugLogsEmptyMessage } from './mm-logs-filter'
import { MmToast } from './mm-toast'
import { initMmTooltipDelegation } from './mm-tooltip'

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
    this.bindEvents()
    this.bindScrollIndicator()
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

  private getScopeSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="scope-select"]') as MmSearchSelect | null
  }

  private syncFilterSelectOptions(): void {
    this.syncSourceSelectOptions()
    this.syncScopeSelectOptions()
    this.syncHostSelectOptions()
    this.syncTabSelectOptions()
  }

  private syncSourceSelectOptions(): void {
    const select = this.getSourceSelect()
    if (!select) {
      return
    }
    const sources = [...new Set(this.entries.map((entry) => entry.source).filter((source): source is DebugLogSource => ALL_SOURCES.includes(source)))].sort((a, b) =>
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

  private syncHostSelectOptions(): void {
    const select = this.getHostSelect()
    if (!select) {
      return
    }
    const hosts = [...new Set(this.entries.map((entry) => entry.meta?.host?.trim()).filter((host): host is string => Boolean(host)))].sort((a, b) =>
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

  private syncScopeSelectOptions(): void {
    const select = this.getScopeSelect()
    if (!select) {
      return
    }
    const scopes = [...new Set(this.entries.map((entry) => entry.scope?.trim()).filter((scope): scope is string => Boolean(scope)))].sort((a, b) =>
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

  private syncTabSelectOptions(): void {
    const select = this.getTabSelect()
    if (!select) {
      return
    }
    const tabIds = [...new Set(this.entries.filter((entry) => entry.meta?.tabId != null).map((entry) => String(entry.meta!.tabId)))].sort((a, b) => Number(a) - Number(b))
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
      search: this.search,
    }
  }

  private getFilteredEntries(): DebugLogEntry[] {
    return filterDebugLogEntries(this.entries, this.getFilterCriteria())
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

  private renderList(): void {
    const rowsRoot = this.querySelector('[data-ref="rows"]') as HTMLElement | null
    const list = this.querySelector('[data-ref="list"]') as HTMLElement | null
    if (!rowsRoot || !list) {
      return
    }
    const rows = this.getFilteredEntries()
    if (rows.length === 0) {
      rowsRoot.classList.add('mm-logs-rows--empty')
      rowsRoot.innerHTML = `<div class="mm-logs-empty">${this.escapeHtml(getDebugLogsEmptyMessage(this.entries.length))}</div>`
      this.scrollIndicatorRefresh?.()
      return
    }
    rowsRoot.classList.remove('mm-logs-rows--empty')
    rowsRoot.innerHTML = rows
      .map((entry) => {
        const host = entry.meta?.host?.trim() ?? '—'
        const tabId = entry.meta?.tabId != null ? String(entry.meta.tabId) : '—'
        const tabCell =
          entry.meta?.tabId != null
            ? this.renderQuickFilterCell('mm-logs-cell--tab mm-logs-cell--tab-link', 'tab', tabId, tabId, `Filter by tab ${tabId} (⌘/Ctrl+click to focus tab)`)
            : `<span class="mm-logs-cell mm-logs-cell--tab">${this.escapeHtml(tabId)}</span>`
        return `<div class="mm-logs-row mm-logs-row--${entry.level}" role="row">
          <span class="mm-logs-cell mm-logs-cell--time" data-mm-tooltip="${this.escapeAttr(this.formatTimeFull(entry.t))}" data-mm-tooltip-placement="bottom" data-mm-tooltip-align="center" data-mm-tooltip-wide role="gridcell">${this.formatTime(entry.t)}</span>
          <span class="mm-logs-cell mm-logs-cell--level" data-level="${entry.level}" data-mm-tooltip="${this.escapeAttr(`${entry.level} level`)}" data-mm-tooltip-placement="bottom" role="gridcell">${entry.level}</span>
          ${this.renderQuickFilterCell('mm-logs-cell--source', 'source', entry.source, entry.source, `Filter by source ${entry.source}`)}
          ${this.renderQuickFilterCell('mm-logs-cell--scope', 'scope', entry.scope, entry.scope, `Filter by scope ${entry.scope.trim()}`)}
          ${this.renderQuickFilterCell('mm-logs-cell--host', 'host', host === '—' ? '' : host, host, host === '—' ? undefined : `Filter by host ${host}`)}
          ${tabCell}
          <span class="mm-logs-cell mm-logs-cell--message" role="gridcell" data-mm-tooltip="${this.escapeAttr(entry.message)}" data-mm-tooltip-placement="bottom" data-mm-tooltip-align="start" data-mm-tooltip-wide>${this.escapeHtml(entry.message)}</span>
        </div>`
      })
      .join('')
    if (this.autoScroll) {
      list.scrollTop = list.scrollHeight
    }
    this.scrollIndicatorRefresh?.()
  }

  private renderFooter(): void {
    const footer = this.querySelector('[data-ref="footer"]') as HTMLElement | null
    if (!footer) {
      return
    }
    const filteredCount = this.getFilteredEntries().length
    const mode = getCachedShellLogOutputMode()
    footer.textContent = formatDebugLogsFooterText({
      filteredCount,
      totalCount: this.entries.length,
      maxEntries: MAX_DEBUG_LOG_ENTRIES,
      logMode: mode,
    })
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
    this.renderList()
    this.renderFooter()
  }
}
