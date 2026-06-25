import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/** Dark syntax colors aligned with VS Code / VWS shell. */
const darkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#569cd6' },
  { tag: [t.name, t.deleted, t.character, t.propertyName], color: '#9cdcfe' },
  { tag: [t.function(t.variableName), t.labelName], color: '#dcdcaa' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: '#4fc1ff' },
  { tag: [t.definition(t.name), t.separator], color: '#e6eaf0' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: '#4ec9b0' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: '#d4d4d4' },
  { tag: [t.meta, t.comment], color: '#6a9955', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: '#569cd6', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: '#569cd6' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: '#569cd6' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: '#ce9178' },
  { tag: t.invalid, color: '#f44747' },
])

/**
 * Editor chrome theme (layout + search panel) layered on editor-base.css tokens.
 */
export const editorChromeTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', position: 'relative' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': { minHeight: '120px', caretColor: '#e6eaf0' },
  /* Overlay panel slot — float on editor, do not push content (VS Code style) */
  '.cm-panels': {
    position: 'absolute',
    left: '0',
    right: '0',
    height: '0',
    minHeight: '0',
    overflow: 'visible',
    pointerEvents: 'none',
    border: 'none',
    background: 'transparent',
    zIndex: '30',
  },
  '.cm-panels-top': { top: '0' },
  '.cm-panels-bottom': { bottom: '0' },
  '.cm-panel.cm-search, .cm-panel.vws-search-panel': {
    position: 'absolute',
    top: '0',
    right: '8px',
    pointerEvents: 'auto',
  },
})

/**
 * Mark editor as dark-themed so CM6 built-in UI picks appropriate variants.
 */
export const editorDarkTheme: Extension = EditorView.darkTheme.of(true)

/**
 * Syntax highlighting extension for dark editor background.
 * @returns Syntax highlighting extension
 */
export function darkSyntaxHighlighting(): Extension {
  return syntaxHighlighting(darkHighlightStyle, { fallback: true })
}
