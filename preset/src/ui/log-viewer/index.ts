/**
 * Log Viewer UI - Modal to view persisted logs with filter and search
 * DEBUG is off by default.
 */

import { appendToDocumentElement } from '@/helpers/dom'
import type { LogLevel } from '@/services/log-store'
import { logStore } from '@/services/log-store'
import { GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'
import iconWarn from '~icons/mdi/alert?raw'
import iconDebug from '~icons/mdi/bug?raw'
import iconOk from '~icons/mdi/check-circle?raw'
import iconLogViewer from '~icons/mdi/clipboard-text?raw'
import iconClose from '~icons/mdi/close?raw'
import iconFail from '~icons/mdi/close-circle?raw'
import iconCopy from '~icons/mdi/content-copy?raw'
import iconHistory from '~icons/mdi/history?raw'
import iconInfo from '~icons/mdi/information?raw'
import iconTrash from '~icons/mdi/trash-can-outline?raw'

import logViewerCss from './index.css?raw'
import logViewerHtml from './index.html?raw'

const TAG = 'vercel-web-script-log-viewer'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

/**
 * Copy plain text to the system clipboard (with execCommand fallback).
 * @param text Text to copy
 * @returns Whether copy likely succeeded
 */
async function copyPlainTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export class LogViewerUI extends HTMLElement {
  static TAG_NAME = TAG
  #shadowRoot: ShadowRoot | null = null
  #unsubscribe: (() => void) | null = null
  #store: typeof logStore | null = null
  /** When false, only logs from current page session are shown; when true, include persisted history */
  #includePrevious = false
  #copyFlashTimer: ReturnType<typeof setTimeout> | null = null

  connectedCallback() {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML

    this.#store = logStore ?? null

    const backdrop = this.#shadowRoot.querySelector('.log-viewer__backdrop')
    const closeBtn = this.#shadowRoot.querySelector('.log-viewer__icon-btn--close')
    const copyBtn = this.#shadowRoot.querySelector('[data-action="copy"]')
    const includePreviousBtn = this.#shadowRoot.querySelector('[data-action="include-previous"]')
    const clearBtn = this.#shadowRoot.querySelector('[data-action="clear"]')
    const searchInput = this.#shadowRoot.querySelector('.log-viewer__search')
    const filterInputs = this.#shadowRoot.querySelectorAll('.log-viewer__filter input')

    if (closeBtn) closeBtn.innerHTML = iconClose
    if (copyBtn) copyBtn.innerHTML = iconCopy
    if (includePreviousBtn) includePreviousBtn.innerHTML = iconHistory
    if (clearBtn) clearBtn.innerHTML = iconTrash

    backdrop?.addEventListener('click', () => this.close())
    closeBtn?.addEventListener('click', () => this.close())
    copyBtn?.addEventListener('click', () => void this.#onCopy())
    clearBtn?.addEventListener('click', () => this.#onClear())
    includePreviousBtn?.addEventListener('click', () => this.#onToggleIncludePrevious())
    searchInput?.addEventListener('input', () => this.#render())
    filterInputs.forEach((input) => input.addEventListener('change', () => this.#render()))
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    if (this.#copyFlashTimer != null) {
      clearTimeout(this.#copyFlashTimer)
      this.#copyFlashTimer = null
    }
  }

  open() {
    this.classList.add('log-viewer--open')
    this.#includePrevious = false
    this.#updateIncludePreviousButton()
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

  #onToggleIncludePrevious() {
    this.#includePrevious = !this.#includePrevious
    this.#updateIncludePreviousButton()
    this.#render()
  }

  async #onCopy() {
    const filtered = this.#getFilteredLogEntries()
    if (filtered.length === 0) {
      return
    }
    const lines = filtered.map((e) => this.#formatLinePlain(e))
    const text = lines.join('\n')
    const ok = await copyPlainTextToClipboard(text)
    const btn = this.#shadowRoot?.querySelector('[data-action="copy"]') as HTMLButtonElement | null
    if (!btn) {
      return
    }
    if (this.#copyFlashTimer != null) {
      clearTimeout(this.#copyFlashTimer)
    }
    btn.classList.toggle('log-viewer__icon-btn--copied', ok)
    btn.title = ok ? 'Copied' : 'Copy failed — check permissions'
    this.#copyFlashTimer = setTimeout(() => {
      btn.classList.remove('log-viewer__icon-btn--copied')
      btn.title = 'Copy visible logs (respects filters & search)'
      this.#copyFlashTimer = null
    }, 1600)
  }

  #updateIncludePreviousButton() {
    const btn = this.#shadowRoot?.querySelector('[data-action="include-previous"]') as HTMLButtonElement | null
    if (btn) {
      btn.title = this.#includePrevious ? 'Showing all sessions — click for this session only' : 'Include logs from previous sessions'
      btn.setAttribute('aria-pressed', this.#includePrevious ? 'true' : 'false')
      btn.classList.toggle('log-viewer__icon-btn--active', this.#includePrevious)
    }
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

  /**
   * One line for clipboard (plain text).
   */
  #formatLinePlain(e: LogEntry): string {
    return `${this.#formatTime(e.timestamp)} [${e.level.toUpperCase()}] ${e.message}`
  }

  /**
   * Entries after level + search filter (same as rendered list).
   */
  #getFilteredLogEntries(): LogEntry[] {
    if (!this.#store) {
      return []
    }
    const levels = this.#getSelectedLevels()
    const keyword = this.#getSearchKeyword()
    const scope = this.#includePrevious ? 'all' : 'current'
    const entries = this.#store.getLogs(scope)
    return entries.filter((e) => {
      if (!levels.has(e.level)) return false
      if (keyword && !e.message.toLowerCase().includes(keyword)) return false
      return true
    })
  }

  #render() {
    if (!this.#shadowRoot) return

    const listEl = this.#shadowRoot.querySelector('.log-viewer__list') as HTMLElement
    if (!listEl) return

    const copyBtn = this.#shadowRoot.querySelector('[data-action="copy"]') as HTMLButtonElement | null

    if (!this.#store) {
      listEl.innerHTML = ''
      const empty = document.createElement('div')
      empty.className = 'log-viewer__empty'
      empty.textContent = 'Log store not available (logger may not be loaded)'
      listEl.appendChild(empty)
      if (copyBtn) copyBtn.disabled = true
      return
    }

    const filtered = this.#getFilteredLogEntries()
    const entries: LogEntry[] = this.#store.getLogs(this.#includePrevious ? 'all' : 'current')

    if (copyBtn) {
      copyBtn.disabled = filtered.length === 0
    }

    listEl.innerHTML = ''

    if (filtered.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'log-viewer__empty'
      if (entries.length === 0) {
        empty.textContent = this.#includePrevious ? 'No logs yet' : 'No logs this session'
      } else {
        empty.textContent = 'No matching logs'
      }
      listEl.appendChild(empty)
      return
    }

    const icons: Record<LogLevel, string> = {
      info: iconInfo,
      ok: iconOk,
      warn: iconWarn,
      fail: iconFail,
      debug: iconDebug,
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

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, LogViewerUI)
}

if (typeof document !== 'undefined' && !document.querySelector(TAG)) {
  const container = document.createElement(TAG)
  container.innerHTML = `<template><style>${logViewerCss}</style>${logViewerHtml}</template>`
  appendToDocumentElement(container)
}

GME_registerCommandPaletteCommand({
  id: 'log',
  keywords: ['log', 'logs', 'viewer'],
  title: 'Open Log Viewer',
  iconHtml: iconLogViewer,
  hint: 'View script logs',
  action: () => GME_openLogViewer(),
})

export function GME_openLogViewer(): void {
  const el = document.querySelector(TAG) as LogViewerUI | null
  if (el?.open) el.open()
}
