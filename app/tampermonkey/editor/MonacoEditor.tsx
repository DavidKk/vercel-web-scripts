'use client'

import { Editor } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'

import { TAMPERMONKEY_TYPINGS } from './typings'

// Theme colors inspired by One Dark
const ONE_DARK_THEME = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c678dd' },
    { token: 'number', foreground: 'd19a66' },
    { token: 'string', foreground: '98c379' },
    { token: 'operator', foreground: '56b6c2' },
    { token: 'type', foreground: 'e5c07b' },
    { token: 'function', foreground: '61afef' },
    { token: 'variable', foreground: 'abb2bf' },
    { token: 'constant', foreground: 'd19a66' },
  ],
  colors: {
    'editor.background': '#282c34',
    'editor.foreground': '#abb2bf',
    'editorCursor.foreground': '#528bff',
    'editor.lineHighlightBackground': '#2c313a',
    'editorLineNumber.foreground': '#4b5263',
    'editor.selectionBackground': '#3e4451',
    'editorIndentGuide.background': '#3b4048',
    'editorIndentGuide.activeBackground': '#c8ccd4',
  },
}

interface MonacoEditorProps {
  content: string
  path?: string
  language?: 'javascript' | 'typescript' | 'json'
  onChange?: (content: string) => void
  onSave?: () => void
  onCompile?: () => void
  isDevMode?: boolean
  readOnly?: boolean
}

export default function MonacoEditor({ content, path, language = 'javascript', onChange, onSave, onCompile, isDevMode = false, readOnly = false }: MonacoEditorProps) {
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onCompileRef = useRef(onCompile)
  const isDevModeRef = useRef(isDevMode)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    onCompileRef.current = onCompile
  }, [onCompile])

  useEffect(() => {
    isDevModeRef.current = isDevMode
  }, [isDevMode])

  const handleEditorWillMount = (monaco: any) => {
    monaco.editor.defineTheme('one-dark', ONE_DARK_THEME)

    // Configure typescript defaults
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ['node_modules/@types'],
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
      lib: ['esnext', 'dom', 'dom.iterable'],
    })

    // Same for javascript
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ['node_modules/@types'],
      allowJs: true,
      lib: ['esnext', 'dom', 'dom.iterable'],
    })

    // Load custom type definitions
    monaco.languages.typescript.typescriptDefaults.addExtraLib(TAMPERMONKEY_TYPINGS, 'file:///typings.d.ts')
    monaco.languages.typescript.javascriptDefaults.addExtraLib(TAMPERMONKEY_TYPINGS, 'file:///typings.d.ts')
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    // Add Cmd+S keyboard shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onCompileRef.current) {
        onCompileRef.current()
      }
    })

    // Focus on mount
    editor.focus()
  }

  const handleEditorChange = (value: string | undefined) => {
    if (onChangeRef.current) {
      onChangeRef.current(value || '')
    }
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        width="100%"
        path={path}
        language={language}
        value={content}
        theme="one-dark"
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
        options={{
          readOnly,
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          padding: { top: 16, bottom: 16 },
          automaticLayout: true,
          scrollbar: {
            vertical: 'hidden',
            horizontal: 'hidden',
          },
          lineNumbers: 'on',
          glyphMargin: false,
          folding: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 3,
        }}
      />
    </div>
  )
}
