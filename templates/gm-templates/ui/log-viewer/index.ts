/**
 * Log Viewer UI - Modal to view persisted logs with filter and search
 * DEBUG is off by default.
 */

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
}

interface LogStoreAPI {
  getLogs: () => LogEntry[]
  clearLogs: () => void
  subscribe: (cb: (entries: LogEntry[]) => void) => () => void
}

const TAG = 'vercel-web-script-log-viewer'

class LogViewerUI extends HTMLElement {
  static TAG_NAME = TAG
  #shadowRoot: ShadowRoot | null = null
  #unsubscribe: (() => void) | null = null
  #store: LogStoreAPI | null = null

  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML

    this.#store = typeof (window as any).logStore !== 'undefined' ? (window as any).logStore : null

    const backdrop = this.#shadowRoot.querySelector('.log-viewer__backdrop')
    const closeBtn = this.#shadowRoot.querySelector('.log-viewer__close')
    const clearBtn = this.#shadowRoot.querySelector('.log-viewer__clear')
    const searchInput = this.#shadowRoot.querySelector('.log-viewer__search')
    const filterInputs = this.#shadowRoot.querySelectorAll('.log-viewer__filter input')

    backdrop?.addEventListener('click', () => this.close())
    closeBtn?.addEventListener('click', () => this.close())
    clearBtn?.addEventListener('click', () => this.#onClear())
    searchInput?.addEventListener('input', () => this.#render())
    filterInputs?.forEach((input) => input.addEventListener('change', () => this.#render()))
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  open() {
    this.classList.add('log-viewer--open')
    this.#unsubscribe?.()
    if (this.#store?.subscribe) {
      this.#unsubscribe = this.#store.subscribe(() => this.#render())
    }
    this.#render()
  }

  close() {
    this.classList.remove('log-viewer--open')
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  #onClear() {
    this.#store?.clearLogs()
    this.#render()
  }

  #getSelectedLevels(): Set<LogLevel> {
    const set = new Set<LogLevel>()
    const inputs = this.#shadowRoot?.querySelectorAll('.log-viewer__filter input:checked')
    inputs?.forEach((input) => {
      const level = (input as HTMLInputElement).getAttribute('data-level') as LogLevel
      if (level) set.add(level)
    })
    return set
  }

  #getSearchKeyword(): string {
    const input = this.#shadowRoot?.querySelector('.log-viewer__search') as HTMLInputElement
    return (input?.value ?? '').trim().toLowerCase()
  }

  #formatTime(ts: number): string {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  #render() {
    if (!this.#shadowRoot) return

    const listEl = this.#shadowRoot.querySelector('.log-viewer__list') as HTMLElement
    if (!listEl) return

    const levels = this.#getSelectedLevels()
    const keyword = this.#getSearchKeyword()

    const entries: LogEntry[] = this.#store?.getLogs() ?? []
    const filtered = entries.filter((e) => {
      if (!levels.has(e.level)) return false
      if (keyword && !e.message.toLowerCase().includes(keyword)) return false
      return true
    })

    listEl.innerHTML = ''

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'log-viewer__empty'
      empty.textContent = entries.length === 0 ? 'No logs yet' : 'No matching logs'
      listEl.appendChild(empty)
      return
    }

    const icons: Record<LogLevel, string> = {
      info: 'ℹ',
      ok: '✔',
      warn: '⚠',
      fail: '✘',
      debug: '🔍',
    }

    filtered.forEach((e) => {
      const row = document.createElement('div')
      row.className = `log-viewer__entry log-viewer__entry--${e.level}`
      row.innerHTML = `
        <span class="log-viewer__entry-time">${this.#formatTime(e.timestamp)}</span>
        <span class="log-viewer__entry-icon">${icons[e.level] ?? ''}</span>
        <span class="log-viewer__entry-msg">${escapeHtml(e.message)}</span>
      `
      listEl.appendChild(row)
    })

    listEl.scrollTop = listEl.scrollHeight
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, LogViewerUI)
}

function openLogViewer() {
  const el = document.querySelector(TAG) as LogViewerUI
  if (el && typeof el.open === 'function') {
    el.open()
  }
}

try {
  if (typeof window !== 'undefined') {
    ;(window as any).GME_openLogViewer = openLogViewer
  }
} catch (_) {}
