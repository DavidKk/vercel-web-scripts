'use client'

import { DiffEditor, Editor } from '@monaco-editor/react'
import { useEffect, useRef, useState } from 'react'

import { Spinner } from '@/components/Spinner'
import { formatCode } from '@/utils/format'

import { DEFAULT_EDITOR_OPTIONS, DIFF_EDITOR_OPTIONS, setupMonacoEditor } from './config'

interface ExtraLib {
  content: string
  filePath: string
}

export interface CodeEditorRef {
  /** Navigate to a specific line number */
  navigateToLine: (lineNumber: number) => void
  /** Set editor content (for file switching) */
  setContent: (content: string, forceUpdate?: boolean) => Promise<void>
  /** Get current editor content */
  getContent: () => string
  /** Check if editor is ready */
  isReady: () => boolean
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
  const previousContentRef = useRef<string>('')
  const isInternalChangeRef = useRef(false)
  const isEditorReadyRef = useRef(false)
  const setContentCancelRef = useRef<(() => void) | null>(null)
  const setContentSequenceRef = useRef(0)
  const [isEditorReady, setIsEditorReady] = useState(false)

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

  // Note: We don't use useEffect to sync content changes as it causes cursor jumping
  // Instead, content changes should be handled explicitly via ref methods

  const handleEditorWillMount = (monaco: any) => {
    setupMonacoEditor(monaco, extraLibs)
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

    // Set initial content using setValue
    // Always set content, even if it's empty string
    const initialContent = content || ''
    editor.setValue(initialContent)
    previousContentRef.current = initialContent

    // Mark editor as ready
    isEditorReadyRef.current = true
    setIsEditorReady(true)

    // Expose editor methods via ref
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
        setContent: async (newContent: string, forceUpdate = false) => {
          // Cancel previous setContent operation if it's still pending
          if (setContentCancelRef.current) {
            setContentCancelRef.current()
            setContentCancelRef.current = null
          }

          // Increment sequence number to track this operation
          const currentSequence = ++setContentSequenceRef.current
          let isCancelled = false

          // Create cancel function for this operation
          const cancel = () => {
            isCancelled = true
            if (setContentCancelRef.current === cancel) {
              setContentCancelRef.current = null
            }
          }
          setContentCancelRef.current = cancel

          // Wait for editor to be ready before setting content
          if (!isEditorReadyRef.current) {
            // Wait for editor to be ready (max 5 seconds timeout)
            const maxWaitTime = 5000
            const startTime = Date.now()
            while (!isEditorReadyRef.current && !isCancelled && Date.now() - startTime < maxWaitTime) {
              await new Promise((resolve) => setTimeout(resolve, 50))
            }
            // If cancelled or still not ready after timeout, return early
            if (isCancelled) {
              return
            }
            if (!isEditorReadyRef.current) {
              // eslint-disable-next-line no-console
              console.warn('[CodeEditor] Editor not ready, cannot set content')
              setContentCancelRef.current = null
              return
            }
          }

          // Check if cancelled before proceeding
          if (isCancelled || currentSequence !== setContentSequenceRef.current) {
            return
          }

          if (editor) {
            const currentContent = editor.getValue()

            // Always update if forceUpdate is true, or if content is different
            if (forceUpdate || newContent !== currentContent) {
              // Set internal change flag to prevent onChange callback
              isInternalChangeRef.current = true

              // Wait for model to be ready before setting value
              const model = editor.getModel()
              if (!model) {
                // eslint-disable-next-line no-console
                console.warn('[CodeEditor] Editor model not ready, cannot set content')
                isInternalChangeRef.current = false
                setContentCancelRef.current = null
                return
              }

              // Check if cancelled before setting value
              if (isCancelled || currentSequence !== setContentSequenceRef.current) {
                isInternalChangeRef.current = false
                return
              }

              // Use requestAnimationFrame to ensure model is fully ready
              await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                  // Check if cancelled before setting value
                  if (isCancelled || currentSequence !== setContentSequenceRef.current) {
                    isInternalChangeRef.current = false
                    setContentCancelRef.current = null
                    resolve() // Resolve instead of reject to avoid unhandled promise rejection
                    return
                  }

                  // Set the new content
                  editor.setValue(newContent)

                  // Update content reference immediately (synchronously)
                  previousContentRef.current = newContent

                  // For file switching (forceUpdate=true), reset cursor to top
                  if (forceUpdate) {
                    editor.setPosition({ lineNumber: 1, column: 1 })
                    editor.revealLine(1)
                  }

                  // Wait one more frame to ensure setValue has completed
                  requestAnimationFrame(() => {
                    // Check if cancelled before completing
                    if (isCancelled || currentSequence !== setContentSequenceRef.current) {
                      isInternalChangeRef.current = false
                      setContentCancelRef.current = null
                      resolve() // Resolve instead of reject
                      return
                    }

                    // Reset flag after setValue has completed
                    setTimeout(() => {
                      isInternalChangeRef.current = false
                      // Only clear cancel ref if this is still the current operation
                      if (currentSequence === setContentSequenceRef.current) {
                        setContentCancelRef.current = null
                      }
                      resolve()
                    }, 0)
                  })
                })
              })
            } else {
              // Content is the same, clear cancel ref
              setContentCancelRef.current = null
            }
          } else {
            setContentCancelRef.current = null
          }
        },
        getContent: () => {
          return editor ? editor.getValue() : ''
        },
        isReady: () => {
          return isEditorReadyRef.current && editor !== null
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
    const newValue = value || ''

    // Update previous content reference
    previousContentRef.current = newValue

    // Only trigger onChange if this is a real user change (not from setValue)
    if (!isInternalChangeRef.current && onChangeRef.current) {
      onChangeRef.current(newValue)
    }
  }

  // If diff mode is enabled, show DiffEditor
  if (diffMode) {
    return (
      <div className="h-full w-full overflow-hidden flex flex-col relative">
        {/* Loading State for Diff Mode */}
        {!isEditorReady && (
          <div className="absolute inset-0 bg-[#1e1e1e] flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <Spinner color="text-[#cccccc]" />
              <span className="text-sm text-[#cccccc]">Loading Diff Editor...</span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            width="100%"
            original={diffMode.original}
            modified={diffMode.modified}
            language={language}
            theme="vs-code-dark"
            beforeMount={handleEditorWillMount}
            onMount={() => {
              setIsEditorReady(true)
            }}
            options={DIFF_EDITOR_OPTIONS}
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
    <div className="h-full w-full overflow-hidden relative">
      {/* Loading State */}
      {!isEditorReady && (
        <div className="absolute inset-0 bg-[#1e1e1e] flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-3">
            <Spinner color="text-[#cccccc]" />
            <span className="text-sm text-[#cccccc]">Loading Editor...</span>
          </div>
        </div>
      )}

      {/* Editor */}
      <Editor
        height="100%"
        width="100%"
        path={path}
        language={language}
        theme="vs-code-dark"
        beforeMount={handleEditorWillMount}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
        options={{
          ...DEFAULT_EDITOR_OPTIONS,
          readOnly,
        }}
      />
    </div>
  )
}
