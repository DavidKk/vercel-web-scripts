import { isDebugLogViewerIncognito } from '@ext/shared/debug-log-utils'
import { ACCEPT_ALPHA_PREFIX } from '@ext/shared/extension-multi-service-pure'
import {
  INCOGNITO_SCRIPT_ENABLED_PREFIX,
  parseScriptEnabledStorageKey,
  parseScriptInstalledStorageKey,
  SCRIPT_ENABLED_PREFIX,
  SCRIPT_INSTALLED_PREFIX,
  SCRIPTKEY_LIST_CACHE_PREFIX,
  setScriptEnabled,
} from '@ext/shared/extension-storage'
import { parseAcceptAlphaStorageKey, setAcceptAlphaForScript } from '@ext/shared/extension-storage/accept-alpha'
import { SERVICES_STORAGE_KEY } from '@ext/types'

import { type AdminRoute, buildAdminHash, parseAdminHash } from '../admin/mm-admin-hash'
import { subscribeAdminViewActivated } from '../admin/mm-admin-view-lifecycle'
import type { MmSearchSelect } from '../mm-form-components/mm-search-select'
import { hydrateMmIcons } from '../mm-icons'
import { createMmScriptsSwitch } from '../shared/mm-scripts-switch'
import { MmToast } from '../shared/mm-toast'
import { initMmTooltipDelegation, updateMmTooltip } from '../shared/mm-tooltip'
import { computeScriptsFooterStats, formatScriptsFooterText } from './mm-scripts-footer'
import { reloadList } from './mm-scripts-list-data'
import { renderGroupRows } from './mm-scripts-row-render'
import { bindScrollIndicator, updateScrollIndicator } from './mm-scripts-scroll'
import type { ScriptKeyGroupView, ScriptRow } from './mm-scripts-types'
import { subscribeScriptsDebug } from './scripts-debug-state'

/**
 * Scripts page — scriptKey-grouped scroll list.
 */
export class MmScriptsApp extends HTMLElement {
  private bound = false
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  enabledByKey = new Map<string, boolean>()
  groups: ScriptKeyGroupView[] = []
  private unsubscribeDebug: (() => void) | undefined
  scrollResizeObserver: ResizeObserver | undefined
  reloadToken = 0
  private pendingScriptFocus: { scriptKey: string; file: string } | null = null
  private focusFilterClearedOnce = false
  private unsubscribeAdminView: (() => void) | undefined
  private masterSwitchInput: HTMLInputElement | null = null
  private masterSwitchRoot: HTMLLabelElement | null = null
  private bulkToggleInProgress = false
  installToggleInProgress = false
  readonly acceptAlphaByFile = new Map<string, boolean>()
  readonly scriptTogglesIncognito = isDebugLogViewerIncognito()
  readonly handleListScroll = (): void => updateScrollIndicator(this)
  readonly toast = new MmToast(document)

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    initMmTooltipDelegation(this)
    this.prepareInitialLoadingShell()
    this.bindEvents()
    this.syncServiceFilterOptions()
    bindScrollIndicator(this, this)
    this.unsubscribeAdminView = subscribeAdminViewActivated('scripts', (route) => {
      this.captureScriptFocusFromRoute(route)
      void reloadList(this, this, { showShell: true })
    })

    this.unsubscribeDebug = subscribeScriptsDebug(() => {
      void reloadList(this, this, { showShell: true })
    })

    this.storageListener = (changes, area) => {
      if (area !== 'local') {
        return
      }
      const keys = Object.keys(changes)
      if (keys.length === 0) {
        return
      }
      const onlyScriptToggleKeys = keys.every((key) => this.isScriptEnabledStorageKey(key) || key.startsWith(SCRIPT_INSTALLED_PREFIX))
      const onlyAcceptAlphaKeys = keys.every((key) => key.startsWith(ACCEPT_ALPHA_PREFIX))
      if (onlyAcceptAlphaKeys) {
        for (const key of keys) {
          const parsed = parseAcceptAlphaStorageKey(key)
          if (!parsed) {
            continue
          }
          const acceptAlpha = changes[key].newValue === true
          const mapKey = this.acceptAlphaMapKey(parsed.scriptKey, parsed.file)
          this.acceptAlphaByFile.set(mapKey, acceptAlpha)
          for (const group of this.groups) {
            if (group.scriptKey !== parsed.scriptKey) {
              continue
            }
            const row = group.rows.find((r) => r.file === parsed.file)
            if (row) {
              row.acceptAlpha = acceptAlpha
            }
          }
        }
        if (!this.bulkToggleInProgress) {
          this.applyFilters()
        }
        return
      }
      if (onlyScriptToggleKeys) {
        for (const key of keys) {
          if (this.isScriptEnabledStorageKey(key)) {
            const parsed = parseScriptEnabledStorageKey(key)
            if (!parsed || parsed.incognito !== this.scriptTogglesIncognito) {
              continue
            }
            const enabled = changes[key].newValue !== false
            const mapKey = parsed.scriptKey ? `${parsed.scriptKey}:${parsed.file}` : parsed.file
            this.enabledByKey.set(mapKey, enabled)
            for (const group of this.groups) {
              if (parsed.scriptKey && group.scriptKey !== parsed.scriptKey) {
                continue
              }
              const row = group.rows.find((r) => r.file === parsed.file)
              if (row) {
                row.enabled = enabled
              }
            }
            continue
          }

          const parsed = parseScriptInstalledStorageKey(key)
          if (!parsed) {
            continue
          }
          const installed = changes[key].newValue !== false
          for (const group of this.groups) {
            if (group.scriptKey !== parsed.scriptKey) {
              continue
            }
            const row = group.rows.find((r) => r.file === parsed.file)
            if (row) {
              row.installed = installed
              if (installed) {
                row.enabled = true
              } else {
                row.enabled = false
              }
            }
          }
        }
        if (!this.bulkToggleInProgress && !this.installToggleInProgress) {
          this.applyFilters()
        }
        return
      }
      if (keys.some((k) => k.startsWith(SCRIPTKEY_LIST_CACHE_PREFIX) || k === SERVICES_STORAGE_KEY)) {
        void reloadList(this, this, { showShell: true })
      }
    }
    chrome.storage.onChanged.addListener(this.storageListener)
  }

  disconnectedCallback(): void {
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener)
    }
    this.unsubscribeDebug?.()
    this.unsubscribeAdminView?.()
    this.unsubscribeAdminView = undefined
    const scroller = this.querySelector('[data-ref="scroller"]') as HTMLElement | null
    scroller?.removeEventListener('scroll', this.handleListScroll)
    this.scrollResizeObserver?.disconnect()
  }

  enabledMapKey(scriptKey: string, file: string): string {
    return `${scriptKey}:${file}`
  }

  private isScriptEnabledStorageKey(key: string): boolean {
    if (this.scriptTogglesIncognito) {
      return key.startsWith(INCOGNITO_SCRIPT_ENABLED_PREFIX)
    }
    return key.startsWith(SCRIPT_ENABLED_PREFIX)
  }

  acceptAlphaMapKey(scriptKey: string, file: string): string {
    return `${scriptKey}:${file}`
  }

  async handleAcceptAlphaToggle(scriptKey: string, file: string, acceptAlpha: boolean): Promise<void> {
    await setAcceptAlphaForScript(scriptKey, file, acceptAlpha)
    const mapKey = this.acceptAlphaMapKey(scriptKey, file)
    this.acceptAlphaByFile.set(mapKey, acceptAlpha)
    for (const group of this.groups) {
      const row = group.rows.find((r) => r.scriptKey === scriptKey && r.file === file)
      if (row) {
        row.acceptAlpha = acceptAlpha
      }
    }
    this.toast.show(acceptAlpha ? `${file}: OTA track ALP — reload tabs to apply` : `${file}: OTA track STB`)
    this.applyFilters()
  }

  private mountMasterSwitch(): void {
    const slot = this.querySelector('[data-ref="list-head"] [data-ref="master-switch"]') as HTMLElement | null
    if (!slot || slot.querySelector('.mm-scripts-switch')) {
      return
    }

    const { root, input } = createMmScriptsSwitch({ variant: 'on-off', checked: true, disabled: true })
    root.classList.add('mm-scripts-master-switch')
    slot.append(root)
    this.masterSwitchRoot = root
    this.masterSwitchInput = input
    this.applyMasterSwitchTooltipPlacement(root)

    input.addEventListener('change', () => {
      void this.applyBulkScriptToggle(input.checked)
    })
  }

  private applyMasterSwitchTooltipPlacement(root: HTMLLabelElement): void {
    root.setAttribute('data-mm-tooltip-placement', 'bottom')
    root.setAttribute('data-mm-tooltip-align', 'center')
    root.setAttribute('data-mm-tooltip-no-flip', '')
  }

  private getActiveScriptRows(): ScriptRow[] {
    return this.groups.flatMap((group) => group.rows.filter((row) => row.groupActive && row.installed))
  }

  private partitionRowsByInstallState(rows: ScriptRow[]): { installed: ScriptRow[]; uninstalled: ScriptRow[] } {
    const installed: ScriptRow[] = []
    const uninstalled: ScriptRow[] = []
    for (const row of rows) {
      if (row.installed) {
        installed.push(row)
      } else {
        uninstalled.push(row)
      }
    }
    installed.sort((a, b) => a.sortIndex - b.sortIndex)
    uninstalled.sort((a, b) => a.sortIndex - b.sortIndex)
    return { installed, uninstalled }
  }

  private syncMasterSwitchState(): void {
    const input = this.masterSwitchInput
    const root = this.masterSwitchRoot
    if (!input || !root) {
      return
    }

    const rows = this.getActiveScriptRows()
    const enabledCount = rows.filter((row) => row.enabled).length

    if (rows.length === 0) {
      input.checked = false
      input.indeterminate = false
      input.disabled = true
      this.setMasterSwitchTooltip(root, input, 'No scripts available')
      return
    }

    input.disabled = false
    if (enabledCount === 0) {
      input.checked = false
      input.indeterminate = false
      this.setMasterSwitchTooltip(root, input, 'Enable all scripts')
    } else if (enabledCount === rows.length) {
      input.checked = true
      input.indeterminate = false
      this.setMasterSwitchTooltip(root, input, 'Disable all scripts')
    } else {
      input.checked = false
      input.indeterminate = true
      this.setMasterSwitchTooltip(root, input, 'Some scripts enabled — click to enable all')
    }
  }

  private setMasterSwitchTooltip(root: HTMLLabelElement, input: HTMLInputElement, text: string): void {
    updateMmTooltip(root, text, 'bottom')
    input.setAttribute('aria-label', text)
  }

  private async applyBulkScriptToggle(enabled: boolean): Promise<void> {
    if (this.bulkToggleInProgress) {
      return
    }

    const rows = this.getActiveScriptRows()
    if (rows.length === 0) {
      return
    }

    this.bulkToggleInProgress = true
    try {
      await Promise.all(rows.map((row) => setScriptEnabled(row.scriptKey, row.file, enabled, { incognito: this.scriptTogglesIncognito })))
      for (const row of rows) {
        row.enabled = enabled
        this.enabledByKey.set(this.enabledMapKey(row.scriptKey, row.file), enabled)
      }
      this.applyFilters()
      this.toast.show(enabled ? 'Enabled all scripts' : 'Disabled all scripts', 'success')
    } finally {
      this.bulkToggleInProgress = false
    }
  }

  private bindEvents(): void {
    this.mountMasterSwitch()
    this.querySelector('[data-ref="search"]')?.addEventListener('input', () => {
      this.applyFilters()
    })
    this.querySelector('[data-ref="filter"]')?.addEventListener('change', () => {
      this.applyFilters()
    })
    this.querySelector('[data-ref="service-select"]')?.addEventListener('mm-search-select-change', () => {
      this.applyFilters()
    })
  }

  private getServiceSelect(): MmSearchSelect | null {
    return this.querySelector('[data-ref="service-select"]') as MmSearchSelect | null
  }

  syncServiceFilterOptions(): void {
    const select = this.getServiceSelect()
    if (!select) {
      return
    }

    const labels = [...new Set(this.groups.flatMap((group) => group.rows.map((row) => row.serviceLabel).filter(Boolean)))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )

    const current = select.getValue() || 'all'
    const next = current !== 'all' && !labels.includes(current) ? 'all' : current

    select.setOptions([{ value: 'all', label: 'All services' }, ...labels.map((label) => ({ value: label, label }))])
    select.setValue(next)
  }

  setLoading(loading: boolean): void {
    if (loading) {
      this.setAttribute('data-loading', '')
    } else {
      this.removeAttribute('data-loading')
    }
    const skeleton = this.querySelector('[data-ref="skeleton"]') as HTMLElement | null
    skeleton?.setAttribute('aria-busy', loading ? 'true' : 'false')
    this.syncScriptsFooterVisibility(loading)
  }

  private syncScriptsFooterVisibility(loading = this.hasAttribute('data-loading')): void {
    const footer = this.querySelector('[data-ref="footer"]') as HTMLElement | null
    if (!footer) {
      return
    }
    footer.classList.toggle('hidden', loading)
  }

  private syncScriptsFooter(options?: { visibleCount?: number; filtered?: boolean }): void {
    const footer = this.querySelector('[data-ref="footer"]') as HTMLElement | null
    if (!footer || this.hasAttribute('data-loading')) {
      return
    }

    const allRows = this.groups.flatMap((group) => group.rows)
    const stats = computeScriptsFooterStats(allRows)
    footer.textContent = formatScriptsFooterText({
      ...stats,
      visibleCount: options?.visibleCount,
      filtered: options?.filtered,
    })
    footer.classList.remove('hidden')
  }

  /** HTML already has data-loading; avoid toggling attributes before first paint. */
  private prepareInitialLoadingShell(): void {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    this.setListVisible(false)
    emptyEl?.classList.add('hidden')
    if (!this.hasAttribute('data-loading')) {
      this.setLoading(true)
    }
  }

  /** Show skeleton and hide list before any async storage/API work. */
  showLoadingShell(): void {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    this.setLoading(true)
    this.setListVisible(false)
    emptyEl?.classList.add('hidden')
    errorEl?.classList.add('hidden')
  }

  presentError(message: string): void {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    this.groups = []
    this.syncServiceFilterOptions()
    this.setLoading(false)
    emptyEl?.classList.add('hidden')
    this.setListVisible(false)
    this.renderGroups([])
    this.syncScriptsFooter()
    if (errorEl) {
      errorEl.textContent = message
      errorEl.classList.remove('hidden')
    }
  }

  presentEmpty(html: string): void {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    this.groups = []
    this.syncServiceFilterOptions()
    this.setLoading(false)
    errorEl?.classList.add('hidden')
    this.setListVisible(false)
    this.renderGroups([])
    if (emptyEl) {
      emptyEl.innerHTML = html
      emptyEl.classList.remove('hidden')
    }
    this.syncScriptsFooter()
  }

  setListVisible(visible: boolean): void {
    const listHead = this.querySelector('[data-ref="list-head"]') as HTMLElement | null
    const scrollShell = this.querySelector('[data-ref="scroll-shell"]') as HTMLElement | null
    if (listHead) {
      listHead.classList.toggle('hidden', !visible)
      listHead.setAttribute('aria-hidden', visible ? 'false' : 'true')
    }
    scrollShell?.classList.toggle('hidden', !visible)
    updateScrollIndicator(this)
  }

  applyFilters(): void {
    const search = ((this.querySelector('[data-ref="search"]') as HTMLInputElement | null)?.value ?? '').trim().toLowerCase()
    const filter = ((this.querySelector('[data-ref="filter"]') as HTMLInputElement | null)?.value ?? 'all') as 'all' | 'installed' | 'uninstalled'
    const serviceFilter = this.getServiceSelect()?.getValue() || 'all'

    const filteredGroups: Array<{ group: ScriptKeyGroupView; rows: ScriptRow[] }> = []
    let totalRows = 0
    let visibleRows = 0

    for (const group of this.groups) {
      totalRows += group.rows.length
      const rows = group.rows.filter((row) => {
        if (serviceFilter !== 'all' && row.serviceLabel !== serviceFilter) {
          return false
        }
        if (
          search &&
          !row.file.toLowerCase().includes(search) &&
          !row.label.toLowerCase().includes(search) &&
          !(row.description?.toLowerCase().includes(search) ?? false) &&
          !(row.version?.toLowerCase().includes(search) ?? false) &&
          !(row.author?.toLowerCase().includes(search) ?? false)
        ) {
          return false
        }
        if (filter === 'installed') {
          return row.installed
        }
        if (filter === 'uninstalled') {
          return !row.installed
        }
        return true
      })
      visibleRows += rows.length
      if (rows.length > 0) {
        filteredGroups.push({ group, rows })
      }
    }

    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    if (visibleRows === 0 && totalRows > 0 && emptyEl) {
      errorEl?.classList.add('hidden')
      emptyEl.classList.remove('hidden')
      emptyEl.textContent = 'No scripts match the current filter.'
      this.setListVisible(false)
    } else if (totalRows > 0 && emptyEl) {
      emptyEl.classList.add('hidden')
      errorEl?.classList.add('hidden')
      this.setListVisible(true)
    }

    this.renderGroups(filteredGroups)
    this.syncMasterSwitchState()
    const hasActiveFilters = Boolean(((this.querySelector('[data-ref="search"]') as HTMLInputElement | null)?.value ?? '').trim()) || filter !== 'all' || serviceFilter !== 'all'
    this.syncScriptsFooter({ visibleCount: visibleRows, filtered: hasActiveFilters })
    this.revealAndFocusPendingScriptRow(hasActiveFilters)
  }

  private captureScriptFocusFromRoute(route: AdminRoute): void {
    if (route.tab !== 'scripts' || route.scripts.kind !== 'script') {
      return
    }
    this.pendingScriptFocus = { scriptKey: route.scripts.scriptKey, file: route.scripts.file }
    this.focusFilterClearedOnce = false
  }

  private scriptRowExists(scriptKey: string, file: string): boolean {
    return this.groups.some((group) => group.rows.some((row) => row.scriptKey === scriptKey && row.file === file))
  }

  private clearListFilters(): void {
    const searchInput = this.querySelector('[data-ref="search"]') as HTMLInputElement | null
    const filterInput = this.querySelector('[data-ref="filter"]') as HTMLInputElement | null
    if (searchInput) {
      searchInput.value = ''
    }
    if (filterInput) {
      filterInput.value = 'all'
    }
    this.getServiceSelect()?.setValue('all')
  }

  private findScriptRowElement(scriptKey: string, file: string): HTMLElement | null {
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!content) {
      return null
    }
    for (const row of content.querySelectorAll<HTMLElement>('.mm-script-row')) {
      if (row.dataset.scriptKey === scriptKey && row.dataset.scriptFile === file) {
        return row
      }
    }
    return null
  }

  private clearScriptsHashFocus(): void {
    const route = parseAdminHash(location.hash)
    if (route.tab === 'scripts' && route.scripts.kind === 'script') {
      history.replaceState(null, '', buildAdminHash({ tab: 'scripts', scripts: { kind: 'empty' } }))
    }
  }

  private playScriptRowFocusAnimation(row: HTMLElement): void {
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    row.classList.remove('mm-script-row--focus')
    void row.offsetWidth
    row.classList.add('mm-script-row--focus')
    row.addEventListener(
      'animationend',
      () => {
        row.classList.remove('mm-script-row--focus')
      },
      { once: true }
    )
  }

  private revealAndFocusPendingScriptRow(hasActiveFilters: boolean): void {
    const target = this.pendingScriptFocus
    if (!target) {
      return
    }

    if (!this.scriptRowExists(target.scriptKey, target.file)) {
      this.pendingScriptFocus = null
      this.focusFilterClearedOnce = false
      this.clearScriptsHashFocus()
      this.toast.show('Script not found in list.', 'error')
      return
    }

    if (hasActiveFilters && !this.focusFilterClearedOnce) {
      this.focusFilterClearedOnce = true
      this.clearListFilters()
      this.applyFilters()
      return
    }

    const rowEl = this.findScriptRowElement(target.scriptKey, target.file)
    if (!rowEl) {
      requestAnimationFrame(() => this.revealAndFocusPendingScriptRow(false))
      return
    }

    this.pendingScriptFocus = null
    this.focusFilterClearedOnce = false
    this.clearScriptsHashFocus()
    this.playScriptRowFocusAnimation(rowEl)
  }

  renderGroups(filtered: Array<{ group: ScriptKeyGroupView; rows: ScriptRow[] }>): void {
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!content) {
      return
    }
    const { installed, uninstalled } = this.partitionRowsByInstallState(filtered.flatMap(({ rows: groupRows }) => groupRows))
    const fragment = document.createDocumentFragment()
    let index = 0

    if (installed.length > 0) {
      fragment.appendChild(renderGroupRows(this, installed, index))
      index += installed.length
    }

    if (uninstalled.length > 0) {
      fragment.appendChild(renderGroupRows(this, uninstalled, index))
    }

    content.replaceChildren(fragment)
    hydrateMmIcons(content)
    updateScrollIndicator(this)
  }
}
