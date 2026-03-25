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
  /** Optional alias for `title` (some scripts use `text`). */
  text?: string
  /** Matching keywords. Optional so scripts can rely on `onShow/onShown` gating. */
  keywords?: string[]
  /** Command title for matching/rendering. Optional if `text` is provided. */
  title?: string
  /** Plain text or emoji; escaped when rendered. */
  icon?: string
  /** Raw HTML (e.g. inline SVG from unplugin-icons ?raw). Used when set, else icon. */
  iconHtml?: string
  hint?: string
  /**
   * Backward-compatible alias for `onShown`.
   * (Some scripts use `onShow` name.)
   */
  onShow?: (input: string) => boolean
  /**
   * Optional gate to decide whether this command should be shown in the dropdown.
   * Called with the current user input (trimmed, not lowercased).
   * Return `false` to hide the item even if title/keywords match.
   */
  onShown?: (input: string) => boolean
  /**
   * Called when user selects this command.
   * `input` is the current trimmed input from the palette.
   */
  action: (input?: string) => void
}

const PRE_COMMANDS: CommandPaletteCommand[] = []

const COMMAND_PALETTE_BACKLOG_KEY = '__VWS_COMMAND_PALETTE_COMMANDS__'

/**
 * Replay persistent global backlog (populated by global-registry).
 * This allows document-start GIST scripts and post-reload scenarios to register reliably.
 */
function drainGlobalPreCommands(): void {
  const g = typeof __GLOBAL__ !== 'undefined' ? (__GLOBAL__ as any) : (globalThis as any)
  const backlog = g?.[COMMAND_PALETTE_BACKLOG_KEY]
  if (!Array.isArray(backlog) || backlog.length === 0) return

  for (const cmd of backlog) {
    // De-dup by id, matching registerCommand semantics.
    const id = (cmd as any)?.id
    if (typeof id !== 'string' || !id) continue
    const existing = PRE_COMMANDS.find((c) => c.id === id)
    if (existing) {
      PRE_COMMANDS[PRE_COMMANDS.indexOf(existing)] = cmd
    } else {
      PRE_COMMANDS.push(cmd)
    }
  }
}

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

// Drain pre-queue as soon as the module loads (before element init/connection).
drainGlobalPreCommands()

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

  /** True if command is a DEBUG entry (title starts with "DEBUG"); these are shown at the bottom */
  #isDebugCommand(cmd: CommandPaletteCommand): boolean {
    const titleText = cmd.title ?? cmd.text ?? ''
    return titleText.trim().toUpperCase().startsWith('DEBUG')
  }

  /** Sort commands so DEBUG commands (title starts with "DEBUG") are at the bottom; stable order otherwise */
  #sortCommandsWithDebugLast(commands: CommandPaletteCommand[]): CommandPaletteCommand[] {
    return [...commands].sort((a, b) => {
      const aDebug = this.#isDebugCommand(a)
      const bDebug = this.#isDebugCommand(b)
      if (aDebug === bDebug) return 0
      return aDebug ? 1 : -1
    })
  }

  #filterCommands(query: string): CommandPaletteCommand[] {
    const raw = query.trim()
    const q = raw.toLowerCase()

    // Show when title/keywords match OR optional gate passes.
    // For empty input, title/keyword matching defaults to true; gate can still hide items.
    const list = this.#commands.filter((cmd) => {
      let titleOrKeywordMatch = true
      if (q) {
        const titleText = cmd.title ?? cmd.text ?? ''
        const titleMatch = titleText.toLowerCase().includes(q)
        const keywords = cmd.keywords ?? []
        const keywordMatch = keywords.some((k) => k.toLowerCase().includes(q) || k.toLowerCase() === q)
        titleOrKeywordMatch = titleMatch || keywordMatch
      }

      let shownGate = false
      const gate = cmd.onShown ?? cmd.onShow
      if (gate) {
        try {
          shownGate = !!gate(raw)
        } catch {
          // Fail-safe: gate errors should not break the palette, but also shouldn't show items unexpectedly.
          shownGate = false
        }
      }

      return titleOrKeywordMatch || shownGate
    })

    return this.#sortCommandsWithDebugLast(list)
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
      const titleText = cmd.title ?? cmd.text ?? ''
      li.innerHTML = `
          <span class="command-palette__item-icon">${iconContent}</span>
          <div class="command-palette__item-content">
            <div class="command-palette__item-title">${escapeHtml(titleText)}</div>
            ${hintHtml}
          </div>
        `
      listEl.appendChild(li)
    })
  }

  #executeSelected(): void {
    const cmd = this.#filteredCommands[this.#selectedIndex]
    if (cmd?.action) {
      const currentInput = this.#getInputValue()
      this.close()
      cmd.action(currentInput)
    }
  }

  /**
   * Capture-phase keydown on document. When palette is open, consume keydown
   * so page shortcuts (e.g. 语雀) never run; apply keys to our input ourselves.
   * Cmd/Ctrl+A/C/V/X are not consumed so the input keeps native select-all/copy/paste/cut.
   * Single-character keys (and when IME is composing) are not intercepted so the input
   * receives them natively — avoids duplicate input when using IME (e.g. Chinese).
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

    const isSingleChar = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
    if (isSingleChar || event.isComposing) {
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
