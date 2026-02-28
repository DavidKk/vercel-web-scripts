/**
 * Compiled Code Viewer - Modal to view the full compiled script (same as plugin setValue).
 * Entry: command-palette. Shows content from Editor Dev Mode or Local Dev Mode (GM_setValue).
 * Uses CodeMirror read-only with JS syntax highlighting.
 */

import type { Extension } from '@/codemirror'
import {
  defaultHighlightStyle,
  EditorSelection,
  EditorState,
  EditorView,
  javascript as jsLang,
  keymap,
  lineNumbers,
  oneDarkHighlightStyle,
  oneDarkTheme,
  syntaxHighlighting,
} from '@/codemirror'
import { EDITOR_DEV_EVENT_KEY, LOCAL_DEV_EVENT_KEY } from '@/services/dev-mode/constants'
import { GME_registerCommandPaletteCommand } from '@/ui/command-palette/index'

import compiledCodeViewerCss from './index.css?raw'
import compiledCodeViewerHtml from './index.html?raw'

const EMPTY_MESSAGE = 'No compiled content. Start Editor Dev Mode or Local Dev Mode first.'

function getCompiledContent(): string {
  const editor = GM_getValue(EDITOR_DEV_EVENT_KEY) as { compiledContent?: string } | null
  if (editor?.compiledContent) return editor.compiledContent
  const local = GM_getValue(LOCAL_DEV_EVENT_KEY) as { compiledContent?: string } | null
  if (local?.compiledContent) return local.compiledContent
  return ''
}

/** Cmd+A / Ctrl+A: select all in editor so system shortcut works inside readonly viewer (otherwise browser selects whole page). */
const selectAllKeymap = keymap.of([
  {
    key: 'Mod-a',
    run: (view) => {
      const len = view.state.doc.length
      if (len === 0) return false
      view.dispatch({ selection: EditorSelection.single(0, len) })
      return true
    },
  },
])

function buildReadOnlyJsExtensions(): Extension[] {
  try {
    return [oneDarkTheme, lineNumbers(), jsLang(), syntaxHighlighting(oneDarkHighlightStyle), EditorState.readOnly.of(true), selectAllKeymap]
  } catch {
    return [lineNumbers(), syntaxHighlighting(defaultHighlightStyle), EditorState.readOnly.of(true), selectAllKeymap]
  }
}

/**
 * Open the compiled code viewer modal. Shows full JS (plugin setValue value); scrollable, JS syntax highlighting.
 */
export function openCompiledCodeViewer(): void {
  const content = getCompiledContent()
  const text = content || EMPTY_MESSAGE
  const root = document.createElement('div')
  root.innerHTML = `<style>${compiledCodeViewerCss}</style>${compiledCodeViewerHtml}`

  const bodyEl = root.querySelector('.compiled-code-viewer__body') as HTMLElement
  const copyBtn = root.querySelector('.compiled-code-viewer__copy') as HTMLButtonElement
  const backdrop = root.querySelector('.compiled-code-viewer__backdrop')
  const closeBtn = root.querySelector('.compiled-code-viewer__close')

  let view: EditorView | null = null
  if (bodyEl) {
    const host = document.createElement('div')
    host.className = 'compiled-code-viewer__cm-host'
    bodyEl.innerHTML = ''
    bodyEl.appendChild(host)
    const state = EditorState.create({
      doc: text,
      extensions: buildReadOnlyJsExtensions(),
    })
    view = new EditorView({ state, parent: host })
  }

  function close(): void {
    if (!root.parentNode) return
    document.removeEventListener('keydown', onEscape)
    view?.destroy()
    view = null
    root.remove()
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') close()
  }

  backdrop?.addEventListener('click', close)
  closeBtn?.addEventListener('click', close)
  document.addEventListener('keydown', onEscape)

  copyBtn?.addEventListener('click', () => {
    const toCopy = content || (view?.state.doc.toString() ?? '')
    if (!toCopy) return
    navigator.clipboard
      .writeText(toCopy)
      .then(() => {
        const label = copyBtn.textContent
        copyBtn.textContent = 'Copied!'
        setTimeout(() => {
          copyBtn.textContent = label ?? 'Copy'
        }, 1500)
      })
      .catch(() => {})
  })

  document.body.appendChild(root)
  requestAnimationFrame(() => view?.focus())
}

GME_registerCommandPaletteCommand({
  id: 'compiled-code-viewer',
  title: 'View compiled script',
  keywords: ['compiled', 'script', 'code', 'setvalue', 'view', '编译'],
  hint: 'Show full compiled JS (Editor/Local Dev Mode)',
  action: openCompiledCodeViewer,
})
