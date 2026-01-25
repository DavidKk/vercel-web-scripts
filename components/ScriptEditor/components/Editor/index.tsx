'use client'

import { DiffEditor, Editor } from '@monaco-editor/react'
import { useRef, useState } from 'react'

import { DEFAULT_EDITOR_OPTIONS, DIFF_EDITOR_OPTIONS, setupMonacoEditor } from '@/components/Editor/config'
import { Spinner } from '@/components/Spinner'

import { registerEditorShortcuts } from './shortcuts'
import type { CodeEditorRef, InternalCodeEditorProps } from './types'

export type { CodeEditorRef, InternalCodeEditorProps }

/**
 * Internal CodeEditor for ScriptEditor
 * Optimized to pre-initialize both Editor and DiffEditor
 */
export default function InternalCodeEditor({
  defaultValue,
  path = 'index.ts',
  language = 'typescript',
  onChange,
  onSave,
  onValidate,
  readOnly = false,
  extraLibs = [],
  editorRef,
  diffMode,
  onReady,
}: InternalCodeEditorProps) {
  const editorInstanceRef = useRef<any>(null)
  const previousContentRef = useRef<string>('')
  const isInternalChangeRef = useRef(false)
  const isEditorReadyRef = useRef(false)
  const setContentCancelRef = useRef<(() => void) | null>(null)
  const setContentSequenceRef = useRef(0)

  const [isEditorReady, setIsEditorReady] = useState(false)
  const [isDiffEditorReady, setIsDiffEditorReady] = useState(false)

  const handleEditorWillMount = (monaco: any) => {
    setupMonacoEditor(monaco, extraLibs)
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorInstanceRef.current = editor
    const initialContent = defaultValue || ''
    previousContentRef.current = initialContent

    isEditorReadyRef.current = true
    setIsEditorReady(true)

    if (onReady) {
      onReady()
    }

    if (editorRef) {
      ;(editorRef as React.MutableRefObject<CodeEditorRef>).current = {
        navigateToLine: (lineNumber: number) => {
          if (editor && lineNumber > 0) {
            const line = Math.max(1, Math.min(lineNumber, editor.getModel()?.getLineCount() || 1))
            editor.revealLineInCenter(line)
            editor.setPosition({ lineNumber: line, column: 1 })
            editor.focus()
            const model = editor.getModel()
            if (model) {
              const range = new monaco.Range(line, 1, line, model.getLineMaxColumn(line))
              editor.setSelection(range)
              setTimeout(() => {
                editor.setSelection(new monaco.Range(line, 1, line, 1))
              }, 2000)
            }
          }
        },
        setContent: async (newContent: string, forceUpdate = false) => {
          if (setContentCancelRef.current) {
            setContentCancelRef.current()
            setContentCancelRef.current = null
          }

          const currentSequence = ++setContentSequenceRef.current
          let isCancelled = false
          const cancel = () => {
            isCancelled = true
            if (setContentCancelRef.current === cancel) setContentCancelRef.current = null
          }
          setContentCancelRef.current = cancel

          if (!isEditorReadyRef.current) {
            const maxWaitTime = 5000
            const startTime = Date.now()
            while (!isEditorReadyRef.current && !isCancelled && Date.now() - startTime < maxWaitTime) {
              await new Promise((resolve) => setTimeout(resolve, 50))
            }
            if (isCancelled || !isEditorReadyRef.current) return
          }

          if (isCancelled || currentSequence !== setContentSequenceRef.current) return

          if (editor) {
            const currentContent = editor.getValue()
            if (forceUpdate || newContent !== currentContent) {
              isInternalChangeRef.current = true
              const model = editor.getModel()
              if (!model || isCancelled || currentSequence !== setContentSequenceRef.current) {
                isInternalChangeRef.current = false
                return
              }

              await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                  if (isCancelled || currentSequence !== setContentSequenceRef.current) {
                    isInternalChangeRef.current = false
                    resolve()
                    return
                  }
                  editor.setValue(newContent)
                  previousContentRef.current = newContent
                  if (forceUpdate) {
                    editor.setPosition({ lineNumber: 1, column: 1 })
                    editor.revealLine(1)
                  }
                  requestAnimationFrame(() => {
                    if (isCancelled || currentSequence !== setContentSequenceRef.current) {
                      isInternalChangeRef.current = false
                      resolve()
                      return
                    }
                    setTimeout(() => {
                      isInternalChangeRef.current = false
                      if (currentSequence === setContentSequenceRef.current) setContentCancelRef.current = null
                      resolve()
                    }, 0)
                  })
                })
              })
            } else {
              setContentCancelRef.current = null
            }
          } else {
            setContentCancelRef.current = null
          }
        },
        getContent: () => (editor ? editor.getValue() : ''),
        isReady: () => isEditorReadyRef.current && editor !== null,
      }
    }

    // Register shortcuts
    registerEditorShortcuts(editor, monaco, language, onSave)

    editor.focus()
    const disposable = monaco.editor.onDidChangeMarkers(() => {
      const model = editor.getModel()
      if (model && onValidate) {
        const markers = monaco.editor.getModelMarkers({ resource: model.uri })
        const hasError = markers.some((marker: any) => marker.severity === monaco.MarkerSeverity.Error)
        onValidate(hasError)
      }
    })
    return () => disposable.dispose()
  }

  const handleEditorChange = (value: string | undefined) => {
    const newValue = value || ''
    previousContentRef.current = newValue
    if (!isInternalChangeRef.current && onChange) {
      onChange(newValue)
    }
  }

  const isDiffMode = !!diffMode

  return (
    <div className="h-full w-full overflow-hidden relative border border-[#2d2d2d] bg-[#1e1e1e]">
      {/* Loading Overlay - only shows until the active mode is ready */}
      {((!isDiffMode && !isEditorReady) || (isDiffMode && !isDiffEditorReady)) && (
        <div className="absolute inset-0 bg-[#1e1e1e] flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-3">
            <Spinner color="text-[#cccccc]" />
            <span className="text-sm text-[#cccccc]">Loading {isDiffMode ? 'Diff Editor' : 'Editor'}...</span>
          </div>
        </div>
      )}

      {/* Standard Editor Container */}
      <div className="absolute inset-0" style={{ display: isDiffMode ? 'none' : 'block', visibility: isEditorReady ? 'visible' : 'hidden' }}>
        <Editor
          height="100%"
          width="100%"
          path={path}
          defaultValue={defaultValue}
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

      {/* Diff Editor Container */}
      <div className="absolute inset-0 flex flex-col" style={{ display: isDiffMode ? 'flex' : 'none', visibility: isDiffEditorReady ? 'visible' : 'hidden' }}>
        <div className="flex-1 overflow-hidden">
          <DiffEditor
            height="100%"
            width="100%"
            original={diffMode?.original || ''}
            modified={diffMode?.modified || ''}
            language={language}
            theme="vs-code-dark"
            beforeMount={handleEditorWillMount}
            onMount={() => setIsDiffEditorReady(true)}
            options={DIFF_EDITOR_OPTIONS}
          />
        </div>
        {isDiffMode && (diffMode.onAccept || diffMode.onReject) && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[#2d2d2d] bg-[#1e1e1e] flex-shrink-0">
            {diffMode.onReject && (
              <button
                onClick={diffMode.onReject}
                className="px-4 py-2 text-[#d4d4d4] hover:text-[#ffffff] hover:bg-[#2d2d2d] rounded transition-colors flex items-center gap-2 text-sm"
              >
                Reject
              </button>
            )}
            {diffMode.onAccept && (
              <button onClick={diffMode.onAccept} className="px-4 py-2 bg-[#059669] text-[#ffffff] hover:bg-[#047857] rounded transition-colors flex items-center gap-2 text-sm">
                Accept
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
