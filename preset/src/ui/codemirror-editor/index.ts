/**
 * Web component wrapper for CodeMirror 6.
 * Attribute: lang = "json" | "" (plaintext). Fills container, scrollable, line numbers, highlight, indent 2 spaces.
 * Initial state: one line, focus on first line, line number 1 shown; further line numbers appear as user types or presses Enter.
 * No padding lines; getValue/setValue use the actual document content.
 *
 * Rendering: CodeMirror 6 uses viewport/virtual scrolling by default; only visible region and margin are in the DOM,
 * so large documents perform better than a textarea.
 */

import type { Extension } from '@/codemirror'
import { defaultHighlightStyle, EditorState, EditorView, indentUnit, json as jsonLang, lineNumbers, syntaxHighlighting } from '@/codemirror'

import codemirrorEditorCss from './index.css?raw'

export const CODEMIRROR_EDITOR_TAG = 'gme-codemirror-editor'

export interface ICodeMirrorEditorElement extends HTMLElement {
  getValue(): string
  setValue(value: string): void
  focus(): void
  /** Callback when document content changes. Set before or after connect. */
  onChange: (() => void) | null
}

function getLangExtensions(lang: string): Extension[] {
  if (lang === 'json') {
    try {
      return [syntaxHighlighting(defaultHighlightStyle), jsonLang()]
    } catch {
      return []
    }
  }
  return [syntaxHighlighting(defaultHighlightStyle)]
}

/**
 * Builds extensions for the editor: indent, line numbers, change listener, language.
 * Line numbers show for existing lines only (1 for first line; 2, 3, ... as user adds lines).
 * @param lang Language hint (e.g. 'json' or '' for plaintext)
 * @param onChange Called when doc changes
 * @returns Array of CodeMirror extensions
 */
function buildExtensions(lang: string, onChange: () => void): Extension[] {
  const changeListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      onChange()
    }
  })

  return [indentUnit.of('  '), lineNumbers(), changeListener, ...getLangExtensions(lang)]
}

/**
 * Creates EditorState with the given doc and extensions for lang + onChange.
 * @param doc Initial document content
 * @param lang Language hint
 * @param onChange Callback when content changes
 * @returns New EditorState
 */
function createEditorState(doc: string, lang: string, onChange: () => void): EditorState {
  return EditorState.create({ doc, extensions: buildExtensions(lang, onChange) })
}

/** Initial document: one empty line; line number 1 shown, focus on first line. */
const INITIAL_DOC = ''

export class CodeMirrorEditorElement extends HTMLElement implements ICodeMirrorEditorElement {
  private host: HTMLDivElement
  private view: EditorView | null = null
  private _onChange: (() => void) | null = null

  static get observedAttributes(): string[] {
    return ['lang']
  }

  constructor() {
    super()
    const root = this.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = codemirrorEditorCss
    root.appendChild(style)
    this.host = document.createElement('div')
    this.host.className = 'gme-cm-host'
    root.appendChild(this.host)
  }

  private bindOnChange = (): void => {
    this._onChange?.()
  }

  connectedCallback(): void {
    if (this.view) return
    const lang = (this.getAttribute('lang') ?? '').trim().toLowerCase()
    const state = createEditorState(INITIAL_DOC, lang, this.bindOnChange)
    this.view = new EditorView({ state, parent: this.host })
    this.view.focus()
  }

  disconnectedCallback(): void {
    if (this.view) {
      this.view.destroy()
      this.view = null
    }
  }

  attributeChangedCallback(name: string, _old: string | null, newVal: string | null): void {
    if (name !== 'lang' || !this.view) return
    const doc = this.view.state.doc.toString()
    this.view.destroy()
    this.view = null
    const lang = (newVal ?? '').trim().toLowerCase()
    const state = createEditorState(doc || INITIAL_DOC, lang, this.bindOnChange)
    this.view = new EditorView({ state, parent: this.host })
    this.view.focus()
  }

  /** Callback when document content changes. Set before or after connect. */
  get onChange(): (() => void) | null {
    return this._onChange
  }

  set onChange(fn: (() => void) | null) {
    this._onChange = fn
  }

  /** Returns the full document content. */
  getValue(): string {
    return this.view?.state.doc.toString() ?? ''
  }

  /** Replaces the entire document with the given value. */
  setValue(value: string): void {
    if (!this.view) return
    const len = this.view.state.doc.length
    this.view.dispatch({ changes: { from: 0, to: len, insert: value } })
  }

  focus(): void {
    this.view?.focus()
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(CODEMIRROR_EDITOR_TAG)) {
  customElements.define(CODEMIRROR_EDITOR_TAG, CodeMirrorEditorElement)
}
