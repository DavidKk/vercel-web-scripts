import { isDebugLogViewerIncognito } from '@ext/shared/debug-log-utils'
import {
  INCOGNITO_SCRIPT_ENABLED_PREFIX,
  loadScriptEnabledMapForScriptKey,
  loadScriptInstalledMapForScriptKey,
  loadScriptKeyScriptsGroupsFromCache,
  parseScriptEnabledStorageKey,
  parseScriptInstalledStorageKey,
  SCRIPT_ENABLED_PREFIX,
  SCRIPT_INSTALLED_PREFIX,
  SCRIPTKEY_LIST_CACHE_PREFIX,
  type ScriptKeyScriptsGroupView,
  setScriptEnabled,
  setScriptInstalled,
  syncScriptKeyScriptsListIfNeeded,
} from '@ext/shared/extension-storage'
import { navigateExtensionPage } from '@ext/shared/focus-or-open-tab'
import { SERVICES_STORAGE_KEY } from '@ext/types'

import { type AdminRoute, buildAdminHash, parseAdminHash } from '../admin/mm-admin-hash'
import { subscribeAdminViewActivated } from '../admin/mm-admin-view-lifecycle'
import type { MmSearchSelect } from '../mm-form-components/mm-search-select'
import { hydrateMmIcons } from '../mm-icons'
import { buildRulesPageScriptUrl } from '../rules/mm-rules-hash'
import { formatScriptUpdatedAt } from '../shared/mm-format-relative-time'
import { createMmSwitch } from '../shared/mm-switch'
import { MmToast } from '../shared/mm-toast'
import { initMmTooltipDelegation, updateMmTooltip } from '../shared/mm-tooltip'
import { computeScriptsFooterStats, formatScriptsFooterText } from './mm-scripts-footer'
import { createMockScriptKeyScriptsGroups, getScriptsDebugOverrides, subscribeScriptsDebug } from './scripts-debug-state'

type ScriptRow = {
  scriptKey: string
  file: string
  label: string
  description?: string
  icon?: string
  version?: string
  author?: string
  contentHash?: string
  updatedAt?: number
  serviceLabel: string
  serviceUrl: string
  installed: boolean
  enabled: boolean
  groupActive: boolean
  /** Stable server list order within scriptKey group. */
  sortIndex: number
}

type ScriptKeyGroupView = ScriptKeyScriptsGroupView & {
  rows: ScriptRow[]
}

/**
 * Scripts page — scriptKey-grouped scroll list.
 */
export class MmScriptsApp extends HTMLElement {
  private bound = false
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  private enabledByKey = new Map<string, boolean>()
  private groups: ScriptKeyGroupView[] = []
  private unsubscribeDebug: (() => void) | undefined
  private scrollResizeObserver: ResizeObserver | undefined
  private reloadToken = 0
  private pendingScriptFocus: { scriptKey: string; file: string } | null = null
  private focusFilterClearedOnce = false
  private unsubscribeAdminView: (() => void) | undefined
  private masterSwitchInput: HTMLInputElement | null = null
  private masterSwitchRoot: HTMLLabelElement | null = null
  private bulkToggleInProgress = false
  private installToggleInProgress = false
  private readonly scriptTogglesIncognito = isDebugLogViewerIncognito()
  private readonly handleListScroll = (): void => this.updateScrollIndicator()
  private readonly toast = new MmToast(document)

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    initMmTooltipDelegation(this)
    this.prepareInitialLoadingShell()
    this.bindEvents()
    this.syncServiceFilterOptions()
    this.bindScrollIndicator()
    this.unsubscribeAdminView = subscribeAdminViewActivated('scripts', (route) => {
      this.captureScriptFocusFromRoute(route)
      void this.reloadList({ showShell: true })
    })

    this.unsubscribeDebug = subscribeScriptsDebug(() => {
      void this.reloadList({ showShell: true })
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
        void this.reloadList({ showShell: true })
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

  private enabledMapKey(scriptKey: string, file: string): string {
    return `${scriptKey}:${file}`
  }

  private isScriptEnabledStorageKey(key: string): boolean {
    if (this.scriptTogglesIncognito) {
      return key.startsWith(INCOGNITO_SCRIPT_ENABLED_PREFIX)
    }
    return key.startsWith(SCRIPT_ENABLED_PREFIX)
  }

  private wrapScriptTextCell(column: 'index' | 'name' | 'release' | 'file' | 'service', inner: HTMLElement): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = `mm-script-cell mm-script-cell--${column}`
    cell.append(inner)
    return cell
  }

  private buildScriptNameTooltip(item: ScriptRow, nameText: string): string {
    const authorText = item.author?.trim()
    const descriptionText = item.description?.trim()
    const title = authorText ? `${nameText} @${authorText}` : nameText
    if (!descriptionText) {
      return title
    }
    return `${title}\n${descriptionText}`
  }

  private renderNameCell(item: ScriptRow): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'mm-script-cell mm-script-cell--name'

    const block = document.createElement('div')
    block.className = 'mm-script-name-block'

    const iconWrap = document.createElement('div')
    iconWrap.className = 'mm-script-name-icon'
    if (item.icon) {
      const img = document.createElement('img')
      img.className = 'mm-script-name-icon-img'
      img.src = item.icon
      img.alt = ''
      img.loading = 'lazy'
      img.decoding = 'async'
      iconWrap.append(img)
    } else {
      iconWrap.classList.add('mm-script-name-icon--fallback')
      const slot = document.createElement('span')
      slot.className = 'mm-icon-slot'
      slot.setAttribute('data-icon', 'scripts')
      iconWrap.append(slot)
    }

    const text = document.createElement('div')
    text.className = 'mm-script-name-text'

    const nameText = item.label || item.file
    const titleLine = document.createElement('div')
    titleLine.className = 'mm-script-name-title'

    const nameInner = document.createElement('span')
    nameInner.className = 'mm-script-name'
    nameInner.textContent = nameText
    titleLine.append(nameInner)

    const authorText = item.author?.trim()
    if (authorText) {
      const authorInner = document.createElement('span')
      authorInner.className = 'mm-script-author-suffix'
      authorInner.textContent = ` @${authorText}`
      titleLine.append(authorInner)
    }

    text.append(titleLine)

    const descriptionText = item.description?.trim()
    if (descriptionText) {
      const descriptionInner = document.createElement('span')
      descriptionInner.className = 'mm-script-description'
      descriptionInner.textContent = descriptionText
      text.append(descriptionInner)
    }

    this.setFullTextTooltip(text, this.buildScriptNameTooltip(item, nameText))

    block.append(iconWrap, text)
    cell.append(block)
    return cell
  }

  private renderReleaseCell(item: ScriptRow): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'mm-script-cell mm-script-cell--release'

    const block = document.createElement('div')
    block.className = 'mm-script-release-block'

    const versionText = item.version?.trim() ?? ''
    const versionInner = document.createElement('span')
    versionInner.className = 'mm-script-version'
    versionInner.textContent = versionText || '—'
    block.append(versionInner)

    const updatedLabel = formatScriptUpdatedAt(item.updatedAt)
    const updatedInner = document.createElement('span')
    updatedInner.className = 'mm-script-updated'
    updatedInner.textContent = updatedLabel
    block.append(updatedInner)

    const releaseTooltipLines = [versionText || '—', updatedLabel]
    if (typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)) {
      releaseTooltipLines.push(new Date(item.updatedAt).toLocaleString())
    }
    this.setFullTextTooltip(block, releaseTooltipLines.join('\n'))

    cell.append(block)
    return cell
  }

  private renderRow(item: ScriptRow, index: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'mm-script-row'
    row.dataset.scriptKey = item.scriptKey
    row.dataset.scriptFile = item.file
    if (!item.groupActive) {
      row.classList.add('mm-script-row--inactive')
    }

    const indexInner = document.createElement('span')
    indexInner.className = 'mm-script-index'
    indexInner.textContent = String(index + 1)

    const fileInner = document.createElement('span')
    fileInner.className = 'mm-script-file'
    fileInner.textContent = item.file
    this.setFullTextTooltip(fileInner, item.file)

    const installBtn = this.renderInstallButton(item)

    const rulesLink = document.createElement('button')
    rulesLink.type = 'button'
    rulesLink.className = 'mm-script-rules-link mm-icon-btn-sm'
    rulesLink.setAttribute('aria-label', 'Manage local rules for this script')
    rulesLink.setAttribute('data-mm-tooltip', 'Manage local rules')
    rulesLink.disabled = !item.groupActive || !item.installed
    this.applyScriptTooltipPlacement(rulesLink)
    const rulesIcon = document.createElement('span')
    rulesIcon.className = 'mm-icon-slot'
    rulesIcon.setAttribute('data-icon', 'rulesManage')
    rulesLink.append(rulesIcon)
    rulesLink.addEventListener('click', (event) => {
      event.stopPropagation()
      navigateExtensionPage(buildRulesPageScriptUrl(item.scriptKey, item.file))
    })

    const rowChildren: HTMLElement[] = [
      this.wrapScriptTextCell('index', indexInner),
      this.renderNameCell(item),
      this.renderServiceCell(item),
      this.wrapScriptTextCell('file', fileInner),
      this.renderReleaseCell(item),
      rulesLink,
      installBtn,
    ]

    if (item.installed) {
      const switchDisabled = !item.groupActive
      const { root: switchRoot, input } = createMmSwitch({ checked: item.enabled, disabled: switchDisabled })
      this.setSwitchTooltip(switchRoot, input, item)
      rowChildren.push(switchRoot)

      if (item.groupActive) {
        const applyToggle = (): void => {
          void (async () => {
            const enabled = input.checked
            await setScriptEnabled(item.scriptKey, item.file, enabled, { incognito: this.scriptTogglesIncognito })
            this.enabledByKey.set(this.enabledMapKey(item.scriptKey, item.file), enabled)
            item.enabled = enabled
            this.setSwitchTooltip(switchRoot, input, item)
            this.applyFilters()
            this.toast.show(enabled ? `Enabled ${item.file}` : `Disabled ${item.file}`, 'success')
          })()
        }

        input.addEventListener('change', applyToggle)
      }
    }

    row.append(...rowChildren)

    return row
  }

  private renderInstallButton(item: ScriptRow): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `mm-script-install-btn mm-icon-btn-sm ${item.installed ? 'is-installed' : 'is-uninstalled'}`
    btn.disabled = !item.groupActive
    const icon = document.createElement('span')
    icon.className = 'mm-icon-slot'
    icon.setAttribute('data-icon', item.installed ? 'uninstall' : 'install')
    btn.append(icon)

    if (item.installed) {
      btn.setAttribute('aria-label', 'Uninstall script')
      btn.setAttribute('data-mm-tooltip', 'Uninstall script')
    } else {
      btn.setAttribute('aria-label', 'Install script')
      btn.setAttribute('data-mm-tooltip', 'Install script')
    }
    this.applyScriptTooltipPlacement(btn)

    btn.addEventListener('click', (event) => {
      event.stopPropagation()
      void this.applyInstallToggle(item, btn, icon)
    })

    return btn
  }

  private async applyInstallToggle(item: ScriptRow, btn: HTMLButtonElement, icon: HTMLElement): Promise<void> {
    if (!item.groupActive) {
      return
    }

    const nextInstalled = !item.installed
    btn.disabled = true
    this.installToggleInProgress = true
    try {
      if (nextInstalled) {
        await setScriptInstalled(item.scriptKey, item.file, true)
        await setScriptEnabled(item.scriptKey, item.file, true, { incognito: this.scriptTogglesIncognito })
        item.installed = true
        item.enabled = true
      } else {
        await setScriptInstalled(item.scriptKey, item.file, false, item.contentHash)
        await setScriptEnabled(item.scriptKey, item.file, false, { incognito: this.scriptTogglesIncognito })
        item.installed = false
        item.enabled = false
      }
      this.enabledByKey.set(this.enabledMapKey(item.scriptKey, item.file), item.enabled)
      this.applyFilters()
      this.toast.show(nextInstalled ? `Installed ${item.file}` : `Uninstalled ${item.file}`, 'success')
    } finally {
      this.installToggleInProgress = false
      btn.disabled = false
      btn.classList.toggle('is-installed', item.installed)
      btn.classList.toggle('is-uninstalled', !item.installed)
      icon.setAttribute('data-icon', item.installed ? 'uninstall' : 'install')
      hydrateMmIcons(btn)
      if (item.installed) {
        btn.setAttribute('aria-label', 'Uninstall script')
        updateMmTooltip(btn, 'Uninstall script', 'bottom')
      } else {
        btn.setAttribute('aria-label', 'Install script')
        updateMmTooltip(btn, 'Install script', 'bottom')
      }
    }
  }

  private applyScriptTooltipPlacement(el: HTMLElement): void {
    el.setAttribute('data-mm-tooltip-placement', 'bottom')
    el.setAttribute('data-mm-tooltip-align', 'center')
    el.setAttribute('data-mm-tooltip-no-flip', '')
  }

  private setFullTextTooltip(el: HTMLElement, text: string): void {
    const value = text.trim()
    if (!value) {
      return
    }
    el.setAttribute('data-mm-tooltip-wide', '')
    this.applyScriptTooltipPlacement(el)
    updateMmTooltip(el, value, 'bottom')
  }

  private setSwitchTooltip(root: HTMLLabelElement, input: HTMLInputElement, item: ScriptRow): void {
    const text = !item.groupActive ? 'Service disabled — enable in Servers' : !item.installed ? 'Install script first' : input.checked ? 'Disable script' : 'Enable script'
    this.applyScriptTooltipPlacement(root)
    updateMmTooltip(root, text, 'bottom')
    input.setAttribute('aria-label', text)
  }

  private renderServiceCell(item: ScriptRow): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'mm-script-cell mm-script-cell--service'

    if (!item.serviceUrl) {
      const inner = document.createElement('span')
      inner.className = 'mm-script-service'
      inner.textContent = item.serviceLabel
      if (item.serviceLabel) {
        inner.title = item.serviceLabel
      }
      cell.append(inner)
      return cell
    }

    const link = document.createElement('a')
    link.className = 'mm-script-service mm-script-service-link'
    link.href = item.serviceUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = item.serviceLabel || item.serviceUrl
    link.setAttribute('data-mm-tooltip', 'Open service in new tab')
    this.applyScriptTooltipPlacement(link)
    link.addEventListener('click', (event) => {
      event.stopPropagation()
    })
    cell.append(link)
    return cell
  }

  private renderGroupRows(rows: ScriptRow[], startIndex: number): DocumentFragment {
    const fragment = document.createDocumentFragment()
    for (let offset = 0; offset < rows.length; offset++) {
      fragment.appendChild(this.renderRow(rows[offset], startIndex + offset))
    }
    return fragment
  }

  private mountMasterSwitch(): void {
    const slot = this.querySelector('[data-ref="list-head"] [data-ref="master-switch"]') as HTMLElement | null
    if (!slot || slot.querySelector('.mm-switch')) {
      return
    }

    const { root, input } = createMmSwitch({ checked: true, disabled: true })
    root.classList.add('mm-scripts-master-switch')
    slot.append(root)
    this.masterSwitchRoot = root
    this.masterSwitchInput = input
    this.applyScriptTooltipPlacement(root)

    input.addEventListener('change', () => {
      void this.applyBulkScriptToggle(input.checked)
    })
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

  private syncServiceFilterOptions(): void {
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

  private bindScrollIndicator(): void {
    const scroller = this.querySelector('[data-ref="scroller"]') as HTMLElement | null
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!scroller) {
      return
    }
    scroller.addEventListener('scroll', this.handleListScroll, { passive: true })
    this.scrollResizeObserver = new ResizeObserver(() => this.updateScrollIndicator())
    this.scrollResizeObserver.observe(scroller)
    if (content) {
      this.scrollResizeObserver.observe(content)
    }
    this.updateScrollIndicator()
  }

  private setLoading(loading: boolean): void {
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
  private showLoadingShell(): void {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    this.setLoading(true)
    this.setListVisible(false)
    emptyEl?.classList.add('hidden')
    errorEl?.classList.add('hidden')
  }

  private presentError(message: string): void {
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

  private presentEmpty(html: string): void {
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

  private setListVisible(visible: boolean): void {
    const listHead = this.querySelector('[data-ref="list-head"]') as HTMLElement | null
    const scrollShell = this.querySelector('[data-ref="scroll-shell"]') as HTMLElement | null
    if (listHead) {
      listHead.classList.toggle('hidden', !visible)
      listHead.setAttribute('aria-hidden', visible ? 'false' : 'true')
    }
    scrollShell?.classList.toggle('hidden', !visible)
    this.updateScrollIndicator()
  }

  private async reloadList(options?: { showShell?: boolean }): Promise<void> {
    const token = ++this.reloadToken
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null

    if (!emptyEl) {
      return
    }

    const debug = getScriptsDebugOverrides()

    if (debug.forceLoading) {
      this.showLoadingShell()
      return
    }

    if (token !== this.reloadToken) {
      return
    }

    if (debug.forceError !== null) {
      this.presentError(debug.forceError || debug.errorMessage)
      return
    }

    if (debug.mockSampleRows) {
      await this.applyScriptGroups(createMockScriptKeyScriptsGroups(), emptyEl)
      this.setLoading(false)
      return
    }

    const cachedGroups = await loadScriptKeyScriptsGroupsFromCache()
    if (token !== this.reloadToken) {
      return
    }

    if (debug.forceEmpty) {
      const hasServices = cachedGroups.length > 0
      const hint = hasServices
        ? 'No script files on the server. Add <code class="font-mono text-[11px]">.js</code> / <code class="font-mono text-[11px]">.ts</code> files in the editor (rules JSON is not listed here).'
        : 'Configure <strong class="font-medium text-mm-secondary">Servers</strong> (server URL and script key), then reload this page.'
      this.presentEmpty(hint)
      return
    }

    const hasAnyScripts = cachedGroups.some((g) => g.scripts.length > 0)
    if (cachedGroups.length > 0 && hasAnyScripts) {
      await this.applyScriptGroups(cachedGroups, emptyEl)
      this.setLoading(false)
    } else if (options?.showShell) {
      this.showLoadingShell()
    }

    for (const group of cachedGroups) {
      if (!group.active) {
        continue
      }
      const fresh = await syncScriptKeyScriptsListIfNeeded(group.scriptKey)
      if (token !== this.reloadToken) {
        return
      }
      if (fresh && fresh.length > 0) {
        const nextGroups = cachedGroups.map((g) => (g.scriptKey === group.scriptKey ? { ...g, scripts: fresh } : g))
        await this.applyScriptGroups(nextGroups, emptyEl)
        this.setLoading(false)
      }
    }

    if (cachedGroups.length === 0) {
      this.presentEmpty('Configure <strong class="font-medium text-mm-secondary">Servers</strong> (server URL and script key), then reload this page.')
      return
    }

    if (!hasAnyScripts) {
      this.presentEmpty(
        'No script files on the server. Add <code class="font-mono text-[11px]">.js</code> / <code class="font-mono text-[11px]">.ts</code> files in the editor (rules JSON is not listed here).'
      )
    }
  }

  private async applyScriptGroups(groups: ScriptKeyScriptsGroupView[], emptyEl: HTMLElement): Promise<void> {
    const debug = getScriptsDebugOverrides()
    const totalScripts = groups.reduce((sum, g) => sum + g.scripts.length, 0)
    if (totalScripts === 0) {
      this.groups = []
      this.syncServiceFilterOptions()
      this.setListVisible(false)
      this.renderGroups([])
      return
    }

    emptyEl.classList.add('hidden')
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    errorEl?.classList.add('hidden')

    const nextGroups: ScriptKeyGroupView[] = []
    let globalSortIndex = 0
    for (const group of groups) {
      const groupActive = group.active && !debug.forceInactiveGroups
      const enabledByName = await loadScriptEnabledMapForScriptKey(
        group.scriptKey,
        group.scripts.map((s) => s.file),
        { incognito: this.scriptTogglesIncognito }
      )
      const installedByName = await loadScriptInstalledMapForScriptKey(
        group.scriptKey,
        group.scripts.map((s) => s.file),
        new Map(group.scripts.map((s) => [s.file, s.contentHash]))
      )
      const serviceLabel = group.primaryServiceLabel
      const serviceUrl = group.editorBaseUrl.trim().replace(/\/+$/, '')
      const rows: ScriptRow[] = group.scripts.map((s) => {
        const installed = installedByName.get(s.file) !== false
        const enabled = installed && enabledByName.get(s.file) !== false
        this.enabledByKey.set(this.enabledMapKey(group.scriptKey, s.file), enabled)
        return {
          scriptKey: group.scriptKey,
          file: s.file,
          label: s.name,
          description: s.description,
          icon: s.icon,
          version: s.version,
          author: s.author,
          contentHash: s.contentHash,
          updatedAt: s.updatedAt,
          serviceLabel,
          serviceUrl,
          installed,
          enabled,
          groupActive,
          sortIndex: globalSortIndex++,
        }
      })
      nextGroups.push({ ...group, rows })
    }

    this.groups = nextGroups
    this.syncServiceFilterOptions()
    this.setListVisible(true)
    this.applyFilters()
  }

  private applyFilters(): void {
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

  private renderGroups(filtered: Array<{ group: ScriptKeyGroupView; rows: ScriptRow[] }>): void {
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!content) {
      return
    }
    const { installed, uninstalled } = this.partitionRowsByInstallState(filtered.flatMap(({ rows: groupRows }) => groupRows))
    const fragment = document.createDocumentFragment()
    let index = 0

    if (installed.length > 0) {
      fragment.appendChild(this.renderGroupRows(installed, index))
      index += installed.length
    }

    if (uninstalled.length > 0) {
      fragment.appendChild(this.renderGroupRows(uninstalled, index))
    }

    content.replaceChildren(fragment)
    hydrateMmIcons(content)
    this.updateScrollIndicator()
  }

  private updateScrollIndicator(): void {
    requestAnimationFrame(() => {
      const scroller = this.querySelector('[data-ref="scroller"]') as HTMLElement | null
      const scrollbar = this.querySelector('[data-ref="scrollbar"]') as HTMLElement | null
      const thumb = this.querySelector('[data-ref="scrollbar-thumb"]') as HTMLElement | null
      if (!scroller || !scrollbar || !thumb || scrollbar.offsetParent === null) {
        return
      }

      const { scrollHeight, clientHeight, scrollTop } = scroller
      const scrollable = scrollHeight > clientHeight + 1
      scrollbar.classList.toggle('hidden', !scrollable)
      if (!scrollable) {
        thumb.style.height = '0px'
        thumb.style.transform = 'translateY(0)'
        return
      }

      const trackHeight = scrollbar.clientHeight
      const thumbHeight = Math.max(18, Math.round((clientHeight / scrollHeight) * trackHeight))
      const maxTop = Math.max(0, trackHeight - thumbHeight)
      const top = Math.round((scrollTop / (scrollHeight - clientHeight)) * maxTop)
      thumb.style.height = `${thumbHeight}px`
      thumb.style.transform = `translateY(${top}px)`
    })
  }
}
