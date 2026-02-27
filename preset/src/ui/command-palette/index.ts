/**
 * Command palette UI - quick command launcher (Cmd+Shift+P style).
 * Shortcut: Cmd+Shift+P / Ctrl+Shift+P, or double-tap backtick (` `). Type e.g. "log" to open Log Viewer.
 * Scripts can register more commands via GME_registerCommandPaletteCommand().
 *
 * @module command-palette
 */

import { appendToDocumentElement } from '@/helpers/dom'

import paletteCss from './index.css?raw'
import paletteHtml from './index.html?raw'

const TAG = 'vercel-web-script-command-palette'

export interface CommandPaletteCommand {
  id: string
  keywords: string[]
  title: string
  /** Plain text or emoji; escaped when rendered. */
  icon?: string
  /** Raw HTML (e.g. inline SVG from unplugin-icons ?raw). Used when set, else icon. */
  iconHtml?: string
  hint?: string
  action: () => void
}

const PRE_COMMANDS: CommandPaletteCommand[] = []

export function GME_registerCommandPaletteCommand(command: CommandPaletteCommand): void {
  const existing = PRE_COMMANDS.find((c) => c.id === command.id)
  if (existing) {
    PRE_COMMANDS[PRE_COMMANDS.indexOf(existing)] = command
  } else {
    PRE_COMMANDS.push(command)
  }
  const el = document.querySelector(TAG) as CommandPaletteUI | null
  if (el?.registerCommand) {
    el.registerCommand(command)
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

export class CommandPaletteUI extends HTMLElement {
  static TAG_NAME = TAG
  static OPEN_CLASS = 'command-palette--open'
  #shadowRoot: ShadowRoot | null = null
  #commands: CommandPaletteCommand[] = []
  #selectedIndex = 0
  #filteredCommands: CommandPaletteCommand[] = []
  #lastBacktickTime = 0
  static BACKTICK_DOUBLE_MS = 500

  #filterCommands(query: string): CommandPaletteCommand[] {
    const q = query.trim().toLowerCase()
    if (!q) {
      return [...this.#commands]
    }
    return this.#commands.filter((cmd) => {
      const titleMatch = cmd.title.toLowerCase().includes(q)
      const keywordMatch = cmd.keywords.some((k) => k.toLowerCase().includes(q) || k.toLowerCase() === q)
      return titleMatch || keywordMatch
    })
  }

  #getInputValue(): string {
    const input = this.#shadowRoot?.querySelector('.command-palette__input') as HTMLInputElement | null
    return (input?.value ?? '').trim()
  }

  #render(): void {
    if (!this.#shadowRoot) {
      return
    }
    const listEl = this.#shadowRoot.querySelector('.command-palette__list') as HTMLElement | null
    if (!listEl) {
      return
    }

    const query = this.#getInputValue()
    this.#filteredCommands = this.#filterCommands(query)

    if (this.#filteredCommands.length === 0) {
      listEl.innerHTML = '<li class="command-palette__empty">No matching commands</li>'
      return
    }

    this.#selectedIndex = Math.min(this.#selectedIndex, this.#filteredCommands.length - 1)
    listEl.innerHTML = ''
    this.#filteredCommands.forEach((cmd, i) => {
      const li = document.createElement('li')
      li.className = 'command-palette__item' + (i === this.#selectedIndex ? ' command-palette__item--selected' : '')
      li.dataset.index = String(i)
      const iconContent = cmd.iconHtml !== undefined ? cmd.iconHtml : escapeHtml(cmd.icon ?? '◆')
      const hintHtml = cmd.hint ? `<div class="command-palette__item-hint">${escapeHtml(cmd.hint)}</div>` : ''
      li.innerHTML = `
          <span class="command-palette__item-icon">${iconContent}</span>
          <div class="command-palette__item-content">
            <div class="command-palette__item-title">${escapeHtml(cmd.title)}</div>
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

  /**
   * Capture-phase keydown on document. When palette is open, consume keydown
   * so page shortcuts (e.g. 语雀) never run; apply keys to our input ourselves.
   * Cmd/Ctrl+A/C/V/X are not consumed so the input keeps native select-all/copy/paste/cut.
   */
  #captureKeydownHandler = (event: KeyboardEvent): void => {
    if (!this.classList.contains(CommandPaletteUI.OPEN_CLASS)) {
      return
    }

    const input = this.#shadowRoot?.querySelector('.command-palette__input') as HTMLInputElement | null
    if (!input) {
      return
    }

    const mod = event.metaKey || event.ctrlKey
    const inputNativeKeys = mod && (event.key === 'a' || event.key === 'c' || event.key === 'v' || event.key === 'x')
    if (inputNativeKeys) {
      return
    }

    event.stopPropagation()
    event.preventDefault()

    if (event.key === 'Escape') {
      this.close()
      return
    }
    if (event.key === 'Enter') {
      this.#executeSelected()
      return
    }
    if (event.key === 'ArrowDown') {
      this.#selectedIndex = (this.#selectedIndex + 1) % Math.max(1, this.#filteredCommands.length)
      this.#render()
      return
    }
    if (event.key === 'ArrowUp') {
      this.#selectedIndex = (this.#selectedIndex - 1 + this.#filteredCommands.length) % Math.max(1, this.#filteredCommands.length)
      this.#render()
      return
    }

    this.#applyKeyToInput(event, input)
  }

  #applyKeyToInput(event: KeyboardEvent, input: HTMLInputElement): void {
    const value = input.value
    const start = input.selectionStart ?? value.length
    const end = input.selectionEnd ?? value.length

    if (event.key === 'Backspace') {
      if (start === end && start > 0) {
        input.value = value.slice(0, start - 1) + value.slice(end)
        input.setSelectionRange(start - 1, start - 1)
      } else if (start !== end) {
        input.value = value.slice(0, start) + value.slice(end)
        input.setSelectionRange(start, start)
      }
    } else if (event.key === 'Delete') {
      if (start === end && end < value.length) {
        input.value = value.slice(0, start) + value.slice(end + 1)
        input.setSelectionRange(start, start)
      } else if (start !== end) {
        input.value = value.slice(0, start) + value.slice(end)
        input.setSelectionRange(start, start)
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      input.value = value.slice(0, start) + event.key + value.slice(end)
      const newPos = start + event.key.length
      input.setSelectionRange(newPos, newPos)
    }

    input.dispatchEvent(new Event('input', { bubbles: true }))
    this.#selectedIndex = 0
    this.#render()
  }

  #globalKeydownHandler = (event: KeyboardEvent): void => {
    const isP = event.key === 'p' || event.key === 'P'
    if ((event.metaKey && event.shiftKey && isP) || (event.ctrlKey && event.shiftKey && isP)) {
      event.preventDefault()
      this.open()
      return
    }

    if (event.key === '`') {
      const target = event.target as HTMLElement
      const inEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target.isContentEditable && target.getAttribute('contenteditable') === 'true')
      if (inEditable) {
        return
      }
      const now = Date.now()
      if (now - this.#lastBacktickTime < CommandPaletteUI.BACKTICK_DOUBLE_MS) {
        event.preventDefault()
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

  #listClickHandler = (event: Event): void => {
    const target = (event.target as HTMLElement).closest('.command-palette__item')
    if (!target) {
      return
    }
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

    const input = this.#shadowRoot?.querySelector('.command-palette__input') as HTMLInputElement | null
    const backdrop = this.#shadowRoot?.querySelector('.command-palette__backdrop')
    const list = this.#shadowRoot?.querySelector('.command-palette__list')

    input?.addEventListener('input', this.#inputHandler)
    backdrop?.addEventListener('click', () => this.close())
    list?.addEventListener('click', this.#listClickHandler)

    document.addEventListener('keydown', this.#globalKeydownHandler)
    document.addEventListener('keydown', this.#captureKeydownHandler, true)

    this.#commands = [...PRE_COMMANDS]
    PRE_COMMANDS.length = 0
    this.#filteredCommands = [...this.#commands]
    this.#selectedIndex = 0
    this.#render()
  }

  disconnectedCallback(): void {
    document.removeEventListener('keydown', this.#globalKeydownHandler)
    document.removeEventListener('keydown', this.#captureKeydownHandler, true)
  }

  registerCommand(command: CommandPaletteCommand): void {
    const idx = this.#commands.findIndex((c) => c.id === command.id)
    if (idx >= 0) {
      this.#commands[idx] = command
    } else {
      this.#commands.push(command)
    }
    if (this.classList.contains(CommandPaletteUI.OPEN_CLASS)) {
      this.#render()
    }
  }

  open(): void {
    this.classList.add(CommandPaletteUI.OPEN_CLASS)
    this.#selectedIndex = 0
    this.#filteredCommands = this.#filterCommands(this.#getInputValue())
    this.#render()

    requestAnimationFrame(() => {
      const input = this.#shadowRoot?.querySelector('.command-palette__input') as HTMLInputElement | null
      input?.focus()
      input?.select()
    })
  }

  close(): void {
    this.classList.remove(CommandPaletteUI.OPEN_CLASS)
    const input = this.#shadowRoot?.querySelector('.command-palette__input') as HTMLInputElement | null
    input?.blur()
    if (input) {
      input.value = ''
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, CommandPaletteUI)
}

if (typeof document !== 'undefined' && !document.querySelector(TAG)) {
  const container = document.createElement(TAG)
  container.innerHTML = `<template><style>${paletteCss}</style>${paletteHtml}</template>`
  appendToDocumentElement(container)
}

export function GME_openCommandPalette(): void {
  const el = document.querySelector(TAG) as CommandPaletteUI | null
  if (el?.open) {
    el.open()
  }
}
