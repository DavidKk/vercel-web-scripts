import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, keymap, lineNumbers } from '@codemirror/view'

import { darkSyntaxHighlighting, editorChromeTheme, editorDarkTheme } from '@/editor-theme'
import { editorSearchExtensions, editorSearchKeymap, searchKeymap } from '@/search-extensions'
import type { EditorProfile } from '@/types'
import { vscodeEditorKeymap } from '@/vscode-keymap'

import editorBaseCss from './styles/editor-base.css?raw'

/**
 * Base CM6 extensions shared by all profiles (line numbers, highlighting, keymap).
 * @param readOnly Whether editor is read-only
 * @returns Extension array
 */
export function buildBaseExtensions(readOnly: boolean): Extension[] {
  const extensions: Extension[] = [
    editorDarkTheme,
    history(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    drawSelection(),
    darkSyntaxHighlighting(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    ...editorSearchExtensions(),
    EditorView.lineWrapping,
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    editorChromeTheme,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...editorSearchKeymap, ...vscodeEditorKeymap]),
  ]
  return extensions
}

/**
 * Language extensions for a profile.
 * @param profile Editor profile
 * @returns Language extension or empty
 */
export function buildProfileLanguageExtension(profile: EditorProfile): Extension[] {
  switch (profile) {
    case 'json':
      return [json()]
    case 'javascript':
      return [javascript()]
    case 'html':
      return [html()]
    case 'css':
      return [css()]
    case 'markdown':
      return [markdown()]
    case 'plain':
    default:
      return []
  }
}

/**
 * Build full CM6 extensions for a profile.
 * @param profile Editor profile
 * @param readOnly Whether editor is read-only
 * @returns Combined extensions
 */
export function buildProfileExtensions(profile: EditorProfile, readOnly: boolean): Extension[] {
  return [...buildBaseExtensions(readOnly), ...buildProfileLanguageExtension(profile)]
}

/**
 * Inject base editor styles into a mount parent (document head or shadow root).
 * @param parent Document or shadow root
 */
export function injectEditorStyles(parent: Document | ShadowRoot): void {
  const root = parent instanceof Document ? parent.head : parent
  if (root.querySelector('#vws-editor-lib-styles')) {
    return
  }
  const style = (parent instanceof Document ? parent : (parent.ownerDocument ?? document)).createElement('style')
  style.id = 'vws-editor-lib-styles'
  style.textContent = editorBaseCss
  root.appendChild(style)
}

/**
 * Create a CM6 EditorView in the given mount element.
 * @param mount Parent element for the editor
 * @param options Editor options
 * @returns EditorView instance
 */
export function createDirectEditorView(
  mount: HTMLElement,
  options: {
    profile: EditorProfile
    readOnly: boolean
    value: string
    onChange?: (value: string) => void
    styleParent?: Document | ShadowRoot
  }
): EditorView {
  const styleParent = options.styleParent ?? mount.getRootNode()
  if (styleParent instanceof Document || styleParent instanceof ShadowRoot) {
    injectEditorStyles(styleParent)
  }

  const extensions = buildProfileExtensions(options.profile, options.readOnly)
  if (options.onChange) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          options.onChange?.(update.state.doc.toString())
        }
      })
    )
  }

  const state = EditorState.create({
    doc: options.value,
    extensions,
  })

  return new EditorView({
    state,
    parent: mount,
  })
}
