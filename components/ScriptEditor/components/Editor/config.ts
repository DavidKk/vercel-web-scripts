import { loader } from '@monaco-editor/react'

import type { ExtraLib } from './types'

// Configure Monaco loader
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } })

export const DEFAULT_EDITOR_OPTIONS = {
  fontSize: 14,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on' as const,
  padding: { top: 16, bottom: 16 },
  formatOnPaste: true,
  formatOnType: true,
  folding: true,
}

export const DIFF_EDITOR_OPTIONS = {
  ...DEFAULT_EDITOR_OPTIONS,
  enableSplitViewResizing: true,
  renderSideBySide: true,
  readOnly: true,
  originalEditable: false,
}

/**
 * Setup Monaco Editor with custom theme and compiler options
 * @param monaco Monaco instance
 * @param extraLibs Extra libraries to add to TypeScript/JavaScript defaults
 */
export function setupMonacoEditor(monaco: any, extraLibs: ExtraLib[] = []) {
  // Define dark editor theme aligned with the app shell.
  monaco.editor.defineTheme('vs-code-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6f7a8a', fontStyle: 'italic' },
      { token: 'keyword', foreground: '93c5fd' },
      { token: 'string', foreground: '86efac' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'regexp', foreground: 'fca5a5' },
    ],
    colors: {
      'editor.background': '#111318',
      'editor.foreground': '#e6eaf0',
      'editorCursor.foreground': '#3b82f6',
      'editor.lineHighlightBackground': '#1b1f27',
      'editorLineNumber.foreground': '#6f7a8a',
      'editorLineNumber.activeForeground': '#cbd5e1',
      'editor.selectionBackground': '#1f3b63',
      'editor.inactiveSelectionBackground': '#202634',
      'editorIndentGuide.background': '#2a303a',
      'editorIndentGuide.activeBackground': '#3a4352',
      'editorWidget.background': '#171a21',
      'editorWidget.border': '#2a303a',
      'editorSuggestWidget.background': '#171a21',
      'editorSuggestWidget.border': '#2a303a',
      'editorSuggestWidget.selectedBackground': '#202634',
      'editorOverviewRuler.border': '#2a303a',
      'diffEditor.insertedTextBackground': '#22c55e26',
      'diffEditor.removedTextBackground': '#ef444426',
      'diffEditor.insertedLineBackground': '#22c55e14',
      'diffEditor.removedLineBackground': '#ef444414',
    },
  })

  // Configure TypeScript/JavaScript compiler options
  const compilerOptions = {
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    noEmit: true,
    typeRoots: ['node_modules/@types'],
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    checkJs: true,
    lib: ['esnext', 'dom', 'dom.iterable'],
  }

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions)
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions)

  // Add extra libraries
  extraLibs.forEach((lib) => {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath)
    monaco.languages.typescript.javascriptDefaults.addExtraLib(lib.content, lib.filePath)
  })
}
