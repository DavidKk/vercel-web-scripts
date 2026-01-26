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
  // Define One Dark theme
  monaco.editor.defineTheme('vs-code-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#2d2d2d',
      'editorLineNumber.foreground': '#858585',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
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
