'use client'

import { Editor } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'

import { formatCode } from '@/utils/format'

// Theme colors inspired by One Dark
const ONE_DARK_THEME = {
  base: 'vs-dark' as const,
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

interface ExtraLib {
  content: string
  filePath: string
}

interface CommonCodeEditorProps {
  content: string
  path?: string
  language?: 'javascript' | 'typescript' | 'json'
  onChange?: (content: string) => void
  onSave?: () => void
  onCompile?: () => void
  onValidate?: (hasError: boolean) => void
  readOnly?: boolean
  extraLibs?: ExtraLib[]
}

export default function CodeEditor({
  content,
  path = 'index.ts',
  language = 'typescript',
  onChange,
  onSave,
  onCompile,
  onValidate,
  readOnly = false,
  extraLibs = [],
}: CommonCodeEditorProps) {
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onCompileRef = useRef(onCompile)
  const onValidateRef = useRef(onValidate)
  const languageRef = useRef(language)

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
    onValidateRef.current = onValidate
  }, [onValidate])

  useEffect(() => {
    languageRef.current = language
  }, [language])

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

    // Load extra type definitions
    extraLibs.forEach((lib) => {
      monaco.languages.typescript.typescriptDefaults.addExtraLib(lib.content, lib.filePath)
      monaco.languages.typescript.javascriptDefaults.addExtraLib(lib.content, lib.filePath)
    })
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    // Add Cmd+S keyboard shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      // 1. Format code
      const currentContent = editor.getValue()
      const formatted = await formatCode(currentContent, languageRef.current)
      if (formatted !== currentContent) {
        editor.setValue(formatted)
      }

      // 2. Trigger onCompile/onSave
      if (onCompileRef.current) {
        onCompileRef.current()
      }
      if (onSaveRef.current) {
        onSaveRef.current()
      }
    })

    // Focus on mount
    editor.focus()

    // Listen for marker changes (errors/warnings)
    const disposable = monaco.editor.onDidChangeMarkers(() => {
      const model = editor.getModel()
      if (model && onValidateRef.current) {
        const markers = monaco.editor.getModelMarkers({ resource: model.uri })
        const hasError = markers.some((marker: any) => marker.severity === monaco.MarkerSeverity.Error)
        onValidateRef.current(hasError)
      }
    })

    return () => {
      disposable.dispose()
    }
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
