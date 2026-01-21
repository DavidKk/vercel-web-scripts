'use client'

import { DiffEditor, Editor } from '@monaco-editor/react'
import { useEffect, useRef } from 'react'

import { formatCode } from '@/utils/format'

// Theme colors inspired by VS Code Dark+ theme
const VS_CODE_DARK_THEME = {
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

interface ExtraLib {
  content: string
  filePath: string
}

export interface CodeEditorRef {
  /** Navigate to a specific line number */
  navigateToLine: (lineNumber: number) => void
}

interface CommonCodeEditorProps {
  content: string
  path?: string
  language?: 'javascript' | 'typescript' | 'json'
  onChange?: (content: string) => void
  onSave?: () => void
  onValidate?: (hasError: boolean) => void
  readOnly?: boolean
  extraLibs?: ExtraLib[]
  /** Ref to expose editor methods */
  editorRef?: React.RefObject<CodeEditorRef | null>
  /** Diff mode: show diff between original and modified content */
  diffMode?: {
    original: string
    modified: string
    onAccept?: () => void
    onReject?: () => void
  }
}

export default function CodeEditor({
  content,
  path = 'index.ts',
  language = 'typescript',
  onChange,
  onSave,
  onValidate,
  readOnly = false,
  extraLibs = [],
  editorRef,
  diffMode,
}: CommonCodeEditorProps) {
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onValidateRef = useRef(onValidate)
  const languageRef = useRef(language)
  const editorInstanceRef = useRef<any>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    onValidateRef.current = onValidate
  }, [onValidate])

  useEffect(() => {
    languageRef.current = language
  }, [language])

  const handleEditorWillMount = (monaco: any) => {
    monaco.editor.defineTheme('vs-code-dark', VS_CODE_DARK_THEME)

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

  /**
   * Save cursor context for position restoration after formatting
   * @param editor Monaco editor instance
   * @param content Current editor content
   * @returns Cursor context information
   */
  function saveCursorContext(editor: any, content: string) {
    const position = editor.getPosition()
    const selection = editor.getSelection()
    const model = editor.getModel()

    if (!position || !model) {
      return null
    }

    // Get cursor offset in the document
    const cursorOffset = model.getOffsetAt(position)

    // Extract context around cursor (20 characters before and after)
    const contextBefore = Math.max(0, cursorOffset - 20)
    const contextAfter = Math.min(content.length, cursorOffset + 20)
    const beforeText = content.substring(contextBefore, cursorOffset)
    const afterText = content.substring(cursorOffset, contextAfter)

    // Get current line content for fallback
    const currentLine = position.lineNumber
    const lineContent = model.getLineContent(currentLine)

    return {
      position,
      selection,
      cursorOffset,
      beforeText,
      afterText,
      currentLine,
      lineContent,
    }
  }

  /**
   * Restore cursor position after formatting using context matching
   * @param editor Monaco editor instance
   * @param formattedContent Formatted content
   * @param context Saved cursor context
   * @returns True if position was restored successfully
   */
  function restoreCursorPosition(editor: any, formattedContent: string, context: any): boolean {
    if (!context) {
      return false
    }

    const model = editor.getModel()
    if (!model) {
      return false
    }

    // Strategy 1: Try to find cursor position by matching text context
    const searchPattern = context.beforeText + context.afterText
    if (searchPattern.length > 0) {
      const index = formattedContent.indexOf(searchPattern)
      if (index !== -1) {
        // Found matching context, calculate new position
        const newOffset = index + context.beforeText.length
        const newPosition = model.getPositionAt(newOffset)
        if (newPosition) {
          editor.setPosition(newPosition)
          editor.revealLineInCenter(newPosition.lineNumber)
          return true
        }
      }
    }

    // Strategy 2: Try to find by matching beforeText only (more flexible)
    if (context.beforeText.length > 0) {
      const lastIndex = formattedContent.lastIndexOf(context.beforeText)
      if (lastIndex !== -1) {
        const newOffset = lastIndex + context.beforeText.length
        const newPosition = model.getPositionAt(newOffset)
        if (newPosition) {
          editor.setPosition(newPosition)
          editor.revealLineInCenter(newPosition.lineNumber)
          return true
        }
      }
    }

    // Strategy 3: Fallback to same line number (if still valid)
    const maxLine = model.getLineCount()
    if (context.currentLine <= maxLine) {
      const lineContent = model.getLineContent(context.currentLine)
      // Try to find similar position in the line
      let column = context.position.column
      if (column > lineContent.length + 1) {
        column = lineContent.length + 1
      }
      const fallbackPosition = { lineNumber: context.currentLine, column }
      editor.setPosition(fallbackPosition)
      editor.revealLineInCenter(context.currentLine)
      return true
    }

    // Strategy 4: Fallback to end of document
    const lastLine = model.getLineCount()
    const lastLineContent = model.getLineContent(lastLine)
    editor.setPosition({ lineNumber: lastLine, column: lastLineContent.length + 1 })
    editor.revealLineInCenter(lastLine)
    return false
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorInstanceRef.current = editor

    // Expose navigateToLine method via ref
    if (editorRef) {
      ;(editorRef as React.MutableRefObject<CodeEditorRef>).current = {
        navigateToLine: (lineNumber: number) => {
          if (editor && lineNumber > 0) {
            const line = Math.max(1, Math.min(lineNumber, editor.getModel()?.getLineCount() || 1))
            editor.revealLineInCenter(line)
            editor.setPosition({ lineNumber: line, column: 1 })
            editor.focus()

            // Add temporary highlight
            const model = editor.getModel()
            if (model) {
              const range = new monaco.Range(line, 1, line, model.getLineMaxColumn(line))
              editor.setSelection(range)
              // Clear selection after 2 seconds
              setTimeout(() => {
                editor.setSelection(new monaco.Range(line, 1, line, 1))
              }, 2000)
            }
          }
        },
      }
    }

    // Add Cmd+S keyboard shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      // 1. Format code with cursor position preservation
      const currentContent = editor.getValue()
      const formatted = await formatCode(currentContent, languageRef.current)

      if (formatted !== currentContent) {
        // Save view state (includes scroll position, folding, etc.)
        const viewState = editor.saveViewState()

        // Save cursor context for intelligent position restoration
        const cursorContext = saveCursorContext(editor, currentContent)

        // Apply formatted content
        editor.setValue(formatted)

        // Use requestAnimationFrame to ensure setValue has completed and model is ready
        requestAnimationFrame(() => {
          // Restore view state first (preserves scroll position, folding, etc.)
          if (viewState) {
            editor.restoreViewState(viewState)
          }

          // Then restore cursor position using context matching
          // This will override the cursor position from viewState with a more accurate one
          if (cursorContext) {
            restoreCursorPosition(editor, formatted, cursorContext)
          }
        })
      }

      // 2. Trigger onSave
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

  // If diff mode is enabled, show DiffEditor
  if (diffMode) {
    return (
      <div className="h-full w-full overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            width="100%"
            original={diffMode.original}
            modified={diffMode.modified}
            language={language}
            theme="vs-code-dark"
            beforeMount={handleEditorWillMount}
            options={{
              readOnly: true,
              fontSize: 14,
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
              },
              lineNumbers: 'on',
              glyphMargin: false,
              folding: true,
              renderSideBySide: true,
              ignoreTrimWhitespace: false,
              renderIndicators: true,
            }}
          />
        </div>
        {(diffMode.onAccept || diffMode.onReject) && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[#2d2d2d] bg-[#1e1e1e] flex-shrink-0">
            {diffMode.onReject && (
              <button
                onClick={diffMode.onReject}
                className="px-4 py-2 text-[#d4d4d4] hover:text-[#ffffff] hover:bg-[#2d2d2d] rounded transition-colors flex items-center gap-2 text-sm"
              >
                <span>Reject</span>
              </button>
            )}
            {diffMode.onAccept && (
              <button onClick={diffMode.onAccept} className="px-4 py-2 bg-[#059669] text-[#ffffff] hover:bg-[#047857] rounded transition-colors flex items-center gap-2 text-sm">
                <span>Accept</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        height="100%"
        width="100%"
        path={path}
        language={language}
        value={content}
        theme="vs-code-dark"
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
