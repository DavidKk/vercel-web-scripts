import {
  loadExtensionConfig,
  loadManagedScriptListFromCache,
  loadScriptEnabledMap,
  SCRIPT_ENABLED_PREFIX,
  SCRIPT_LIST_CACHE_KEY,
  setScriptEnabled,
  syncManagedScriptListIfNeeded,
} from '@ext/shared/extension-storage'
import { focusOrOpenTab } from '@ext/shared/focus-or-open-tab'
import { sendShellMessage } from '@ext/shared/messages'

import { createMmSwitch } from './mm-switch'
import { getScriptsDebugOverrides, subscribeScriptsDebug } from './scripts-debug-state'

const STATUS_BASE = 'mm-scripts-status text-xs'

type ScriptRow = {
  file: string
  label: string
  enabled: boolean
}

/**
 * Scripts page — full-height plain scroll list.
 */
export class MmScriptsApp extends HTMLElement {
  private bound = false
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  private enabledByName = new Map<string, boolean>()
  private rows: ScriptRow[] = []
  private unsubscribeDebug: (() => void) | undefined
  private scrollResizeObserver: ResizeObserver | undefined
  private reloadToken = 0
  private readonly handleListScroll = (): void => this.updateScrollIndicator()

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.prepareInitialLoadingShell()
    this.bindEvents()
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
          const file = key.slice(SCRIPT_ENABLED_PREFIX.length)
          const row = this.rows.find((r) => r.file === file)
          const enabled = changes[key].newValue !== false
          this.enabledByName.set(file, enabled)
          if (row) {
            row.enabled = enabled
          }
        }
        this.applyFilters()
        return
      }
      if (keys.includes(SCRIPT_LIST_CACHE_KEY)) {
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

  private renderRow(item: ScriptRow, index: number): HTMLElement {
    const row = document.createElement('div')
    row.className = 'mm-script-row'

    const indexEl = document.createElement('span')
    indexEl.className = 'mm-script-index'
    indexEl.textContent = String(index + 1)

    const nameEl = document.createElement('span')
    nameEl.className = 'mm-script-name'
    nameEl.textContent = item.label || item.file

    const fileEl = document.createElement('span')
    fileEl.className = 'mm-script-file'
    fileEl.textContent = item.file

    const { root: switchRoot, input } = createMmSwitch({ checked: item.enabled })
    row.append(indexEl, nameEl, fileEl, switchRoot)

    const applyToggle = (): void => {
      void (async () => {
        const enabled = input.checked
        await setScriptEnabled(item.file, enabled)
        this.enabledByName.set(item.file, enabled)
        item.enabled = enabled
        this.applyFilters()
        this.setStatus(enabled ? `Enabled ${item.file}` : `Disabled ${item.file}`, 'ok')
      })()
    }

    input.addEventListener('change', applyToggle)
    switchRoot.addEventListener('click', (event) => {
      event.stopPropagation()
    })

    row.addEventListener('click', () => {
      input.checked = !input.checked
      applyToggle()
    })

    return row
  }

  private bindEvents(): void {
    this.querySelector('[data-action="sync"]')?.addEventListener('click', () => {
      void (async () => {
        this.setStatus('Syncing…')
        const res = await sendShellMessage({ type: 'SYNC_RULES' })
        const message = res.ok && 'message' in res ? (res.message ?? 'Synced') : res.ok ? 'Synced' : res.error
        this.setStatus(message, res.ok ? 'ok' : 'error')
        await this.reloadList()
      })()
    })
    this.querySelector('[data-action="editor"]')?.addEventListener('click', () => {
      void (async () => {
        const config = await loadExtensionConfig()
        if (config.baseUrl) {
          await focusOrOpenTab(`${config.baseUrl.replace(/\/$/, '')}/editor`)
        }
      })()
    })
    this.querySelector('[data-ref="search"]')?.addEventListener('input', () => {
      this.applyFilters()
    })
    this.querySelector('[data-ref="filter"]')?.addEventListener('change', () => {
      this.applyFilters()
    })
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

  private setStatus(text: string, variant: 'idle' | 'ok' | 'error' = 'idle'): void {
    const el = this.querySelector('[data-ref="status"]') as HTMLElement | null
    if (!el) {
      return
    }
    el.textContent = text
    el.className = variant === 'error' ? `${STATUS_BASE} text-mm-danger` : variant === 'ok' ? `${STATUS_BASE} text-mm-success` : `${STATUS_BASE} text-mm-text-muted`
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
    this.rows = []
    this.setLoading(false)
    emptyEl?.classList.add('hidden')
    this.setListVisible(false)
    this.renderRows([])
    if (errorEl) {
      errorEl.textContent = message
      errorEl.classList.remove('hidden')
    }
  }

  private presentEmpty(html: string): void {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    this.rows = []
    this.setLoading(false)
    errorEl?.classList.add('hidden')
    this.setListVisible(false)
    this.renderRows([])
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

    const config = await loadExtensionConfig()
    if (token !== this.reloadToken) {
      return
    }

    if (debug.forceError !== null) {
      this.presentError(debug.forceError || debug.errorMessage)
      return
    }

    if (debug.forceEmpty) {
      const hint =
        config.baseUrl && config.scriptKey
          ? 'No script files on the server. Add <code class="font-mono text-[11px]">.js</code> / <code class="font-mono text-[11px]">.ts</code> files in the editor (rules JSON is not listed here).'
          : 'Configure <strong class="font-medium text-mm-secondary">Options</strong> (server URL and script key), then reload this page.'
      this.presentEmpty(hint)
      return
    }

    const cachedScripts = await loadManagedScriptListFromCache(config)
    if (token !== this.reloadToken) {
      return
    }

    if (cachedScripts.length > 0) {
      const enabledByName = await loadScriptEnabledMap(cachedScripts.map((s) => s.file))
      if (token !== this.reloadToken) {
        return
      }
      await this.applyScriptRows(cachedScripts, emptyEl, enabledByName)
      this.setLoading(false)
    } else if (options?.showShell) {
      this.showLoadingShell()
    }

    const fresh = await syncManagedScriptListIfNeeded(config)
    if (token !== this.reloadToken) {
      return
    }

    if (fresh && fresh.length > 0) {
      const enabledByName = await loadScriptEnabledMap(fresh.map((s) => s.file))
      if (token !== this.reloadToken) {
        return
      }
      await this.applyScriptRows(fresh, emptyEl, enabledByName)
      this.setLoading(false)
      return
    }

    if (cachedScripts.length === 0) {
      const hint =
        config.baseUrl && config.scriptKey
          ? 'No script files on the server. Add <code class="font-mono text-[11px]">.js</code> / <code class="font-mono text-[11px]">.ts</code> files in the editor (rules JSON is not listed here).'
          : 'Configure <strong class="font-medium text-mm-secondary">Options</strong> (server URL and script key), then reload this page.'
      this.presentEmpty(hint)
    }
  }

  private async applyScriptRows(scripts: { file: string; name: string }[], emptyEl: HTMLElement, enabledByName: Map<string, boolean>): Promise<void> {
    if (scripts.length === 0) {
      this.rows = []
      this.setListVisible(false)
      this.renderRows([])
      return
    }

    emptyEl.classList.add('hidden')
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    errorEl?.classList.add('hidden')
    this.enabledByName = enabledByName
    const rows: ScriptRow[] = scripts.map((s) => ({
      file: s.file,
      label: s.name,
      enabled: this.enabledByName.get(s.file) !== false,
    }))
    this.rows = rows
    this.setListVisible(true)
    this.applyFilters()
  }

  private applyFilters(): void {
    const search = ((this.querySelector('[data-ref="search"]') as HTMLInputElement | null)?.value ?? '').trim().toLowerCase()
    const filter = ((this.querySelector('[data-ref="filter"]') as HTMLSelectElement | null)?.value ?? 'all') as 'all' | 'enabled' | 'disabled'
    const rows = this.rows.filter((row) => {
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

    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const errorEl = this.querySelector('[data-ref="error"]') as HTMLElement | null
    if (rows.length === 0 && this.rows.length > 0 && emptyEl) {
      errorEl?.classList.add('hidden')
      emptyEl.classList.remove('hidden')
      emptyEl.textContent = 'No scripts match the current filter.'
      this.setListVisible(false)
    } else if (this.rows.length > 0 && emptyEl) {
      emptyEl.classList.add('hidden')
      errorEl?.classList.add('hidden')
      this.setListVisible(true)
    }

    this.renderRows(rows)
  }

  private renderRows(rows: ScriptRow[]): void {
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!content) {
      return
    }
    const fragment = document.createDocumentFragment()
    rows.forEach((row, index) => {
      fragment.appendChild(this.renderRow(row, index))
    })
    content.replaceChildren(fragment)
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
