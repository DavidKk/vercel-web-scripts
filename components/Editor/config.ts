/**
 * Monaco Editor configuration and theme definitions
 * Contains all editor settings, themes, and compiler options
 */

// Theme colors inspired by VS Code Dark+ theme
export const VS_CODE_DARK_THEME = {
  base: 'vs-dark' as const,
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
    { token: 'keyword', foreground: '569cd6' },
    { token: 'number', foreground: 'b5cea8' },
    { token: 'string', foreground: 'ce9178' },
    { token: 'operator', foreground: 'd4d4d4' },
    { token: 'type', foreground: '4ec9b0' },
    { token: 'function', foreground: 'dcdcaa' },
    { token: 'variable', foreground: '9cdcfe' },
    { token: 'constant', foreground: '569cd6' },
  ],
  colors: {
    'editor.background': '#1e1e1e',
    'editor.foreground': '#d4d4d4',
    'editorCursor.foreground': '#aeafad',
    'editor.lineHighlightBackground': '#2a2d2e',
    'editorLineNumber.foreground': '#858585',
    'editor.selectionBackground': '#264f78',
    'editorIndentGuide.background': '#404040',
    'editorIndentGuide.activeBackground': '#707070',
    'editorWidget.background': '#252526',
    'editorWidget.border': '#3a3a3a',
    'editorSuggestWidget.background': '#252526',
    'editorSuggestWidget.border': '#3a3a3a',
    'editorSuggestWidget.selectedBackground': '#2a2d2e',
    'editorHoverWidget.background': '#252526',
    'editorHoverWidget.border': '#3a3a3a',
    'editorError.foreground': '#f48771',
    'editorWarning.foreground': '#cca700',
    'editorInfo.foreground': '#75beff',
    'editorBracketMatch.background': '#0e639c',
    'editorBracketMatch.border': '#0e639c',
  },
}

/**
 * TypeScript compiler options for Monaco Editor
 */
export const TYPESCRIPT_COMPILER_OPTIONS = {
  target: 'ESNext' as any,
  allowNonTsExtensions: true,
  moduleResolution: 2, // NodeJs
  module: 1, // CommonJS
  noEmit: true,
  typeRoots: ['node_modules/@types'],
  jsx: 4, // React
  allowJs: true,
  lib: ['esnext', 'dom', 'dom.iterable'],
}

/**
 * JavaScript compiler options for Monaco Editor
 */
export const JAVASCRIPT_COMPILER_OPTIONS = {
  target: 'ESNext' as any,
  allowNonTsExtensions: true,
  moduleResolution: 2, // NodeJs
  module: 1, // CommonJS
  noEmit: true,
  typeRoots: ['node_modules/@types'],
  allowJs: true,
  lib: ['esnext', 'dom', 'dom.iterable'],
}

/**
 * Default editor options
 */
export const DEFAULT_EDITOR_OPTIONS = {
  fontSize: 14,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 16, bottom: 16 },
  automaticLayout: true,
  scrollbar: {
    vertical: 'hidden' as const,
    horizontal: 'hidden' as const,
  },
  lineNumbers: 'on' as const,
  glyphMargin: false,
  folding: true,
  lineDecorationsWidth: 10,
  lineNumbersMinChars: 3,
}

/**
 * Diff editor options
 */
export const DIFF_EDITOR_OPTIONS = {
  readOnly: true,
  fontSize: 14,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  scrollbar: {
    vertical: 'auto' as const,
    horizontal: 'auto' as const,
  },
  lineNumbers: 'on' as const,
  glyphMargin: false,
  folding: true,
  renderSideBySide: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
}

/**
 * Setup Monaco Editor with default configurations
 * @param monaco Monaco instance
 * @param extraLibs Additional type definition libraries
 */
export function setupMonacoEditor(monaco: any, extraLibs: Array<{ content: string; filePath: string }> = []) {
  // Define custom theme
  monaco.editor.defineTheme('vs-code-dark', VS_CODE_DARK_THEME)

  // Configure TypeScript defaults
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    ...TYPESCRIPT_COMPILER_OPTIONS,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
    jsx: monaco.languages.typescript.JsxEmit.React,
  })

  // Configure JavaScript defaults
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    ...JAVASCRIPT_COMPILER_OPTIONS,
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.CommonJS,
  })

  // Load extra type definitions
  extraLibs.forEach((lib) => {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath)
    monaco.languages.typescript.javascriptDefaults.addExtraLib(lib.content, lib.filePath)
  })
}
