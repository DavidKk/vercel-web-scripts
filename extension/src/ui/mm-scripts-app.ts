import {
  loadScriptEnabledMapForScriptKey,
  loadScriptKeyScriptsGroupsFromCache,
  parseScriptEnabledStorageKey,
  SCRIPT_ENABLED_PREFIX,
  SCRIPTKEY_LIST_CACHE_PREFIX,
  type ScriptKeyScriptsGroupView,
  setScriptEnabled,
  syncScriptKeyScriptsListIfNeeded,
} from '@ext/shared/extension-storage'
import { navigateExtensionPage } from '@ext/shared/focus-or-open-tab'
import { SERVICES_STORAGE_KEY } from '@ext/types'

import type { MmSearchSelect } from './mm-form-components/mm-search-select'
import { hydrateMmIcons } from './mm-icons'
import { buildRulesPageScriptUrl } from './mm-rules-hash'
import { createMmSwitch } from './mm-switch'
import { MmToast } from './mm-toast'
import { initMmTooltipDelegation, updateMmTooltip } from './mm-tooltip'
import { getScriptsDebugOverrides, subscribeScriptsDebug } from './scripts-debug-state'

type ScriptRow = {
  scriptKey: string
  file: string
  label: string
  serviceLabel: string
  serviceUrl: string
  enabled: boolean
  groupActive: boolean
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
    void this.reloadList()

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
      const onlyEnabledToggles = keys.every((k) => k.startsWith(SCRIPT_ENABLED_PREFIX))
      if (onlyEnabledToggles) {
        for (const key of keys) {
          const parsed = parseScriptEnabledStorageKey(key)
          if (!parsed) {
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
        }
        this.applyFilters()
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
    const scroller = this.querySelector('[data-ref="scroller"]') as HTMLElement | null
    scroller?.removeEventListener('scroll', this.handleListScroll)
    this.scrollResizeObserver?.disconnect()
  }

  private enabledMapKey(scriptKey: string, file: string): string {
    return `${scriptKey}:${file}`
  }

  private renderRow(item: ScriptRow, index: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'mm-script-row'
    if (!item.groupActive) {
      row.classList.add('mm-script-row--inactive')
    }

    const indexEl = document.createElement('span')
    indexEl.className = 'mm-script-index'
    indexEl.textContent = String(index + 1)

    const serviceEl = this.renderServiceCell(item)

    const nameEl = document.createElement('span')
    nameEl.className = 'mm-script-name'
    const nameText = item.label || item.file
    nameEl.textContent = nameText
    this.setFullTextTooltip(nameEl, nameText)

    const fileEl = document.createElement('span')
    fileEl.className = 'mm-script-file'
    fileEl.textContent = item.file
    this.setFullTextTooltip(fileEl, item.file)

    const rulesLink = document.createElement('button')
    rulesLink.type = 'button'
    rulesLink.className = 'mm-script-rules-link mm-icon-btn-sm'
    rulesLink.setAttribute('aria-label', 'Manage local rules for this script')
    rulesLink.setAttribute('data-mm-tooltip', 'Manage local rules')
    rulesLink.setAttribute('data-mm-tooltip-placement', 'bottom')
    const rulesIcon = document.createElement('span')
    rulesIcon.className = 'mm-icon-slot'
    rulesIcon.setAttribute('data-icon', 'rulesManage')
    rulesLink.append(rulesIcon)
    rulesLink.addEventListener('click', (event) => {
      event.stopPropagation()
      navigateExtensionPage(buildRulesPageScriptUrl(item.scriptKey, item.file))
    })

    const { root: switchRoot, input } = createMmSwitch({ checked: item.enabled, disabled: !item.groupActive })
    this.setSwitchTooltip(switchRoot, input, item)
    row.append(indexEl, nameEl, fileEl, serviceEl, rulesLink, switchRoot)

    if (item.groupActive) {
      const applyToggle = (): void => {
        void (async () => {
          const enabled = input.checked
          await setScriptEnabled(item.scriptKey, item.file, enabled)
          this.enabledByKey.set(this.enabledMapKey(item.scriptKey, item.file), enabled)
          item.enabled = enabled
          this.setSwitchTooltip(switchRoot, input, item)
          this.applyFilters()
          this.toast.show(enabled ? `Enabled ${item.file}` : `Disabled ${item.file}`, 'success')
        })()
      }

      input.addEventListener('change', applyToggle)
    }

    return row
  }

  private setFullTextTooltip(el: HTMLElement, text: string): void {
    const value = text.trim()
    if (!value) {
      return
    }
    el.setAttribute('data-mm-tooltip-wide', '')
    el.setAttribute('data-mm-tooltip-align', 'start')
    updateMmTooltip(el, value, 'bottom')
  }

  private setSwitchTooltip(root: HTMLLabelElement, input: HTMLInputElement, item: ScriptRow): void {
    const text = !item.groupActive ? 'Service disabled — enable in Servers' : input.checked ? 'Disable script' : 'Enable script'
    root.setAttribute('data-mm-tooltip-align', 'end')
    updateMmTooltip(root, text, 'bottom')
    input.setAttribute('aria-label', text)
  }

  private renderServiceCell(item: ScriptRow): HTMLElement {
    if (!item.serviceUrl) {
      const el = document.createElement('span')
      el.className = 'mm-script-service'
      el.textContent = item.serviceLabel
      if (item.serviceLabel) {
        el.title = item.serviceLabel
      }
      return el
    }

    const link = document.createElement('a')
    link.className = 'mm-script-service mm-script-service-link'
    link.href = item.serviceUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = item.serviceLabel || item.serviceUrl
    link.setAttribute('data-mm-tooltip', 'Open service in new tab')
    link.setAttribute('data-mm-tooltip-placement', 'bottom')
    link.addEventListener('click', (event) => {
      event.stopPropagation()
    })
    return link
  }

  private renderGroupRows(rows: ScriptRow[], startIndex: number): DocumentFragment {
    const fragment = document.createDocumentFragment()
    for (let offset = 0; offset < rows.length; offset++) {
      fragment.appendChild(this.renderRow(rows[offset], startIndex + offset))
    }
    return fragment
  }

  private bindEvents(): void {
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
    for (const group of groups) {
      const groupActive = group.active && !debug.forceInactiveGroups
      const enabledByName = await loadScriptEnabledMapForScriptKey(
        group.scriptKey,
        group.scripts.map((s) => s.file)
      )
      const serviceLabel = group.primaryServiceLabel
      const serviceUrl = group.editorBaseUrl.trim().replace(/\/+$/, '')
      const rows: ScriptRow[] = group.scripts.map((s) => {
        const enabled = enabledByName.get(s.file) !== false
        this.enabledByKey.set(this.enabledMapKey(group.scriptKey, s.file), enabled)
        return {
          scriptKey: group.scriptKey,
          file: s.file,
          label: s.name,
          serviceLabel,
          serviceUrl,
          enabled,
          groupActive,
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
    const filter = ((this.querySelector('[data-ref="filter"]') as HTMLInputElement | null)?.value ?? 'all') as 'all' | 'enabled' | 'disabled'
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
        if (search && !row.file.toLowerCase().includes(search) && !row.label.toLowerCase().includes(search)) {
          return false
        }
        if (filter === 'enabled') {
          return row.enabled
        }
        if (filter === 'disabled') {
          return !row.enabled
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
  }

  private renderGroups(filtered: Array<{ group: ScriptKeyGroupView; rows: ScriptRow[] }>): void {
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!content) {
      return
    }
    const fragment = document.createDocumentFragment()
    let index = 0
    for (const { rows } of filtered) {
      fragment.appendChild(this.renderGroupRows(rows, index))
      index += rows.length
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
