import { listKnownScriptNames, loadExtensionConfig, loadExtensionRules, loadScriptEnabledMap, setScriptEnabled } from '@ext/shared/extension-storage'
import { focusOrOpenTab } from '@ext/shared/focus-or-open-tab'
import { sendShellMessage } from '@ext/shared/messages'

import { createMmSwitchRow } from './mm-switch'
import { MmVirtualList } from './mm-virtual-list'

const STATUS_BASE = 'text-sm'
const ROW_HEIGHT = 48
const PAGE_SIZE = 40

type ScriptRow = {
  name: string
  enabled: boolean
}

/**
 * Scripts page — full-height virtual list with incremental scroll loading.
 */
export class MmScriptsApp extends HTMLElement {
  private bound = false
  private storageListener: ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void) | undefined
  private virtualList: MmVirtualList<ScriptRow> | undefined
  private enabledByName = new Map<string, boolean>()
  private allNames: string[] = []

  connectedCallback(): void {
    if (this.bound) {
      return
    }
    this.bound = true
    this.initVirtualList()
    this.bindEvents()
    void this.reloadList()

    this.storageListener = (_changes, area) => {
      if (area === 'local') {
        void this.reloadList()
      }
    }
    chrome.storage.onChanged.addListener(this.storageListener)
  }

  disconnectedCallback(): void {
    if (this.storageListener) {
      chrome.storage.onChanged.removeListener(this.storageListener)
    }
    this.virtualList?.destroy()
  }

  private initVirtualList(): void {
    const scroller = this.querySelector('[data-ref="scroller"]') as HTMLElement | null
    const spacer = this.querySelector('[data-ref="spacer"]') as HTMLElement | null
    const content = this.querySelector('[data-ref="content"]') as HTMLElement | null
    if (!scroller || !spacer || !content) {
      return
    }

    this.virtualList = new MmVirtualList<ScriptRow>({
      scroller,
      spacer,
      content,
      rowHeight: ROW_HEIGHT,
      pageSize: PAGE_SIZE,
      renderRow: (item) => this.renderRow(item),
      onNearEnd: () => this.updateLoadHint(),
    })
  }

  private renderRow(item: ScriptRow): HTMLElement {
    const nameEl = document.createElement('span')
    nameEl.className = 'min-w-0 flex-1 truncate font-mono text-sm text-mm-secondary'
    nameEl.textContent = item.name
    nameEl.title = item.name

    const { row, input } = createMmSwitchRow(nameEl, { checked: item.enabled }, 'mm-list-row')
    row.classList.add('border-b', 'border-mm-border-light/80')

    input.addEventListener('change', () => {
      void (async () => {
        const enabled = input.checked
        await setScriptEnabled(item.name, enabled)
        this.enabledByName.set(item.name, enabled)
        item.enabled = enabled
        this.setStatus(enabled ? `Enabled ${item.name}` : `Disabled ${item.name}`, 'ok')
      })()
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
  }

  private setStatus(text: string, variant: 'idle' | 'ok' | 'error' = 'idle'): void {
    const el = this.querySelector('[data-ref="status"]') as HTMLElement | null
    if (!el) {
      return
    }
    el.textContent = text
    el.className = variant === 'error' ? `${STATUS_BASE} text-mm-danger` : variant === 'ok' ? `${STATUS_BASE} text-mm-success` : `${STATUS_BASE} text-mm-text-muted`
  }

  private updateListMeta(): void {
    const meta = this.querySelector('[data-ref="list-meta"]') as HTMLElement | null
    const loadHint = this.querySelector('[data-ref="load-hint"]') as HTMLElement | null
    if (!meta || !this.virtualList) {
      return
    }
    const { totalCount, revealedCount } = this.virtualList
    if (totalCount === 0) {
      meta.textContent = ''
      if (loadHint) {
        loadHint.classList.add('hidden')
      }
      return
    }

    meta.textContent = revealedCount < totalCount ? `Showing ${revealedCount} of ${totalCount} scripts` : `${totalCount} script${totalCount === 1 ? '' : 's'}`
    this.updateLoadHint()
  }

  private updateLoadHint(): void {
    const loadHint = this.querySelector('[data-ref="load-hint"]') as HTMLElement | null
    if (!loadHint || !this.virtualList) {
      return
    }
    const { totalCount, revealedCount } = this.virtualList
    if (totalCount === 0 || revealedCount >= totalCount) {
      loadHint.classList.add('hidden')
      return
    }
    loadHint.classList.remove('hidden')
    loadHint.textContent = `Scroll down to load more (${revealedCount} / ${totalCount})`
  }

  private async reloadList(): Promise<void> {
    const emptyEl = this.querySelector('[data-ref="empty"]') as HTMLElement | null
    const scroller = this.querySelector('[data-ref="scroller"]') as HTMLElement | null

    if (!this.virtualList || !emptyEl || !scroller) {
      return
    }

    const [rules, all] = await Promise.all([loadExtensionRules(), chrome.storage.local.get(null)])
    this.allNames = listKnownScriptNames(rules, Object.keys(all))

    if (this.allNames.length === 0) {
      emptyEl.classList.remove('hidden')
      emptyEl.innerHTML = 'No scripts yet. Configure Options, then <strong class="font-medium text-mm-secondary">Sync rules from server</strong> to import script names.'
      scroller.classList.add('hidden')
      this.virtualList.setItems([])
      this.updateListMeta()
      return
    }

    emptyEl.classList.add('hidden')
    scroller.classList.remove('hidden')

    this.enabledByName = await loadScriptEnabledMap(this.allNames)
    const rows: ScriptRow[] = this.allNames.map((name) => ({
      name,
      enabled: this.enabledByName.get(name) !== false,
    }))
    this.virtualList.setItems(rows)
    this.updateListMeta()
  }
}
