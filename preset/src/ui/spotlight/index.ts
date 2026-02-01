/**
 * Spotlight UI - macOS-style command palette.
 * Shortcut: Cmd+Shift+P / Ctrl+Shift+P, or double-tap backtick (` `). Type e.g. "log" to open Log Viewer.
 * Scripts can register more commands via GME_registerSpotlightCommand().
 *
 * @module spotlight
 */

import { appendWhenBodyReady } from '../../helpers/dom'
import { GME_openLogViewer } from '../log-viewer/index'
import spotlightCss from './index.css?raw'
import spotlightHtml from './index.html?raw'

const TAG = 'vercel-web-script-spotlight'

export interface SpotlightCommand {
  id: string
  keywords: string[]
  title: string
  icon?: string
  hint?: string
  action: () => void
}

const PRE_COMMANDS: SpotlightCommand[] = []

export function GME_registerSpotlightCommand(command: SpotlightCommand): void {
  const existing = PRE_COMMANDS.find((c) => c.id === command.id)
  if (existing) {
    PRE_COMMANDS[PRE_COMMANDS.indexOf(existing)] = command
  } else {
    PRE_COMMANDS.push(command)
  }
  const el = document.querySelector(TAG) as SpotlightUI | null
  if (el?.registerCommand) el.registerCommand(command)
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

export class SpotlightUI extends HTMLElement {
  static TAG_NAME = TAG
  static OPEN_CLASS = 'spotlight--open'
  #shadowRoot: ShadowRoot | null = null
  #commands: SpotlightCommand[] = []
  #selectedIndex = 0
  #filteredCommands: SpotlightCommand[] = []
  #lastBacktickTime = 0
  static BACKTICK_DOUBLE_MS = 500

  #filterCommands(query: string): SpotlightCommand[] {
    const q = query.trim().toLowerCase()
    if (!q) return [...this.#commands]
    return this.#commands.filter((cmd) => {
      const titleMatch = cmd.title.toLowerCase().includes(q)
      const keywordMatch = cmd.keywords.some((k) => k.toLowerCase().includes(q) || k.toLowerCase() === q)
      return titleMatch || keywordMatch
    })
  }

  #getInputValue(): string {
    const input = this.#shadowRoot?.querySelector('.spotlight__input') as HTMLInputElement | null
    return (input?.value ?? '').trim()
  }

  #render(): void {
    if (!this.#shadowRoot) return
    const listEl = this.#shadowRoot.querySelector('.spotlight__list') as HTMLElement | null
    if (!listEl) return

    const query = this.#getInputValue()
    this.#filteredCommands = this.#filterCommands(query)

    if (this.#filteredCommands.length === 0) {
      listEl.innerHTML = '<li class="spotlight__empty">No matching commands</li>'
      return
    }

    this.#selectedIndex = Math.min(this.#selectedIndex, this.#filteredCommands.length - 1)
    listEl.innerHTML = ''
    this.#filteredCommands.forEach((cmd, i) => {
      const li = document.createElement('li')
      li.className = 'spotlight__item' + (i === this.#selectedIndex ? ' spotlight__item--selected' : '')
      li.dataset.index = String(i)
      const icon = cmd.icon ?? '◆'
      const hintHtml = cmd.hint ? `<div class="spotlight__item-hint">${escapeHtml(cmd.hint)}</div>` : ''
      li.innerHTML = `
          <span class="spotlight__item-icon">${escapeHtml(icon)}</span>
          <div class="spotlight__item-content">
            <div class="spotlight__item-title">${escapeHtml(cmd.title)}</div>
            ${hintHtml}
          </div>
        `
      listEl.appendChild(li)
    })
  }

  #executeSelected(): void {
    const cmd = this.#filteredCommands[this.#selectedIndex]
    if (cmd?.action) {
      this.close()
      cmd.action()
    }
  }

  #keydownHandler = (e: KeyboardEvent): void => {
    if (!this.classList.contains(SpotlightUI.OPEN_CLASS)) return
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      this.#executeSelected()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.#selectedIndex = (this.#selectedIndex + 1) % Math.max(1, this.#filteredCommands.length)
      this.#render()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.#selectedIndex = (this.#selectedIndex - 1 + this.#filteredCommands.length) % Math.max(1, this.#filteredCommands.length)
      this.#render()
      return
    }
  }

  #globalKeydownHandler = (e: KeyboardEvent): void => {
    const isP = e.key === 'p' || e.key === 'P'
    if ((e.metaKey && e.shiftKey && isP) || (e.ctrlKey && e.shiftKey && isP)) {
      e.preventDefault()
      this.open()
      return
    }

    if (e.key === '`') {
      const target = e.target as HTMLElement
      const inEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target.isContentEditable && target.getAttribute('contenteditable') === 'true')
      if (inEditable) return
      const now = Date.now()
      if (now - this.#lastBacktickTime < SpotlightUI.BACKTICK_DOUBLE_MS) {
        e.preventDefault()
        this.#lastBacktickTime = 0
        this.open()
      } else {
        this.#lastBacktickTime = now
      }
    }
  }

  #inputHandler = (): void => {
    this.#selectedIndex = 0
    this.#render()
  }

  #listClickHandler = (e: Event): void => {
    const target = (e.target as HTMLElement).closest('.spotlight__item')
    if (!target) return
    const idx = parseInt(target.getAttribute('data-index') ?? '-1', 10)
    if (idx >= 0 && idx < this.#filteredCommands.length) {
      this.#selectedIndex = idx
      this.#executeSelected()
    }
  }

  connectedCallback(): void {
    const template = this.querySelector('template')
    const innerHTML = template ? template.innerHTML : ''
    template?.remove()

    this.#shadowRoot = this.attachShadow({ mode: 'open' })
    this.#shadowRoot.innerHTML = innerHTML

    const input = this.#shadowRoot?.querySelector('.spotlight__input') as HTMLInputElement | null
    const backdrop = this.#shadowRoot?.querySelector('.spotlight__backdrop')
    const list = this.#shadowRoot?.querySelector('.spotlight__list')

    input?.addEventListener('input', this.#inputHandler)
    input?.addEventListener('keydown', this.#keydownHandler)
    backdrop?.addEventListener('click', () => this.close())
    list?.addEventListener('click', this.#listClickHandler)

    document.addEventListener('keydown', this.#globalKeydownHandler)

    this.#commands = [...PRE_COMMANDS]
    PRE_COMMANDS.length = 0
    this.#registerBuiltinCommands()
    this.#filteredCommands = [...this.#commands]
    this.#selectedIndex = 0
    this.#render()
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.#globalKeydownHandler)
  }

  #registerBuiltinCommands(): void {
    this.#commands.push({
      id: 'log',
      keywords: ['log', 'logs', '日志', 'viewer'],
      title: 'Open Log Viewer',
      icon: '📋',
      hint: 'View script logs',
      action: () => GME_openLogViewer(),
    })
  }

  registerCommand(command: SpotlightCommand): void {
    const idx = this.#commands.findIndex((c) => c.id === command.id)
    if (idx >= 0) this.#commands[idx] = command
    else this.#commands.push(command)
    if (this.classList.contains(SpotlightUI.OPEN_CLASS)) this.#render()
  }

  open(): void {
    this.classList.add(SpotlightUI.OPEN_CLASS)
    this.#selectedIndex = 0
    this.#filteredCommands = this.#filterCommands(this.#getInputValue())
    this.#render()
    requestAnimationFrame(() => {
      const input = this.#shadowRoot?.querySelector('.spotlight__input') as HTMLInputElement | null
      input?.focus()
      input?.select()
    })
  }

  close(): void {
    this.classList.remove(SpotlightUI.OPEN_CLASS)
    const input = this.#shadowRoot?.querySelector('.spotlight__input') as HTMLInputElement | null
    input?.blur()
    if (input) input.value = ''
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, SpotlightUI)
}

if (typeof document !== 'undefined' && !document.querySelector(TAG)) {
  const container = document.createElement(TAG)
  container.innerHTML = `<template><style>${spotlightCss}</style>${spotlightHtml}</template>`
  requestAnimationFrame(() => appendWhenBodyReady(container))
}

export function GME_openSpotlight(): void {
  const el = document.querySelector(TAG) as SpotlightUI | null
  if (el?.open) el.open()
}
