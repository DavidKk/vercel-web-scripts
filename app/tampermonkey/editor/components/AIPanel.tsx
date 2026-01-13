'use client'

import { DiffEditor } from '@monaco-editor/react'
import { useEffect, useRef, useState } from 'react'
import { FiCheck } from 'react-icons/fi'

import { Spinner } from '@/components/Spinner'

interface ChatMessage {
  /** Message ID */
  id: string
  /** User instruction */
  instruction: string
  /** Rewritten content from AI */
  rewrittenContent: string | null
  /** Error message if any */
  error: string | null
  /** Timestamp */
  timestamp: number
}

interface AIPanelProps {
  /** Whether the panel is open */
  isOpen: boolean
  /** Callback when panel is closed */
  onClose: () => void
  /** Callback when rewrite is accepted */
  onAccept: (rewrittenContent: string) => void
  /** Current file content */
  originalContent: string
  /** Current file path */
  filePath: string
  /** File language */
  language: 'typescript' | 'javascript'
  /** Tampermonkey type definitions */
  tampermonkeyTypings?: string
  /** Callback to trigger AI rewrite */
  onRewrite: (instruction: string) => Promise<string>
  /** Callback to navigate to a specific line in the editor */
  onNavigateToLine?: (lineNumber: number) => void
  /** Callback to show diff in editor */
  onShowDiffInEditor?: (original: string, modified: string) => void
}

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
    'diffEditor.insertedTextBackground': '#1e4620',
    'diffEditor.removedTextBackground': '#5a1d1d',
    'diffEditor.insertedLineBackground': '#1e462040',
    'diffEditor.removedLineBackground': '#5a1d1d40',
  },
}

/**
 * AI panel component with diff view for code rewriting
 */
export function AIPanel({ isOpen, onClose, onAccept, originalContent, filePath, language, tampermonkeyTypings, onRewrite, onNavigateToLine, onShowDiffInEditor }: AIPanelProps) {
  const [instruction, setInstruction] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const instructionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  /**
   * Reset panel state
   */
  function resetState() {
    setInstruction('')
    setChatHistory([])
    setSelectedMessageId(null)
  }

  /**
   * Generate unique message ID
   */
  function generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Handle rewrite request
   */
  async function handleRewrite() {
    if (!instruction.trim()) {
      return
    }

    const userInstruction = instruction.trim()
    const messageId = generateMessageId()
    const newMessage: ChatMessage = {
      id: messageId,
      instruction: userInstruction,
      rewrittenContent: null,
      error: null,
      timestamp: Date.now(),
    }

    // Add user message to history
    setChatHistory((prev) => [...prev, newMessage])
    setSelectedMessageId(messageId)
    setInstruction('')
    setIsLoading(true)

    try {
      const result = await onRewrite(userInstruction)
      // Update message with result
      setChatHistory((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, rewrittenContent: result } : msg)))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to rewrite code'
      // Update message with error
      setChatHistory((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, error: errorMessage } : msg)))
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Handle accept rewrite
   */
  function handleAccept(messageId: string) {
    const message = chatHistory.find((msg) => msg.id === messageId)
    if (message && message.rewrittenContent) {
      onAccept(message.rewrittenContent)
      resetState()
      onClose()
    }
  }

  // Focus instruction textarea when panel opens
  useEffect(() => {
    if (isOpen && instructionTextareaRef.current) {
      instructionTextareaRef.current.focus()
    }
  }, [isOpen])

  // Reset when panel closes or file changes
  useEffect(() => {
    if (!isOpen) {
      resetState()
    } else {
      // Reset chat history when file changes
      setChatHistory([])
      setSelectedMessageId(null)
    }
  }, [isOpen, filePath])

  // Scroll to bottom when new message is added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatHistory])

  if (!isOpen) return null

  return (
    <div className="w-96 h-full bg-[#1e1e1e] border-l border-[#2d2d2d] flex flex-col">
      {/* Chat History - Middle */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {chatHistory.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#858585] text-sm">
            <div className="text-center px-4">
              <p className="mb-2">No chat history</p>
              <p className="text-xs">Enter an instruction below to start</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {chatHistory.map((message) => {
              const isSelected = selectedMessageId === message.id
              const hasResult = message.rewrittenContent !== null || message.error !== null

              return (
                <div key={message.id} className={`border border-[#2d2d2d] rounded-lg overflow-hidden ${isSelected ? 'ring-2 ring-[#0e639c]' : ''}`}>
                  {/* Message Header */}
                  <div className="p-3 bg-[#252526]">
                    <div className="cursor-pointer hover:bg-[#2d2d2d] transition-colors -m-3 p-3 rounded-t-lg" onClick={() => setSelectedMessageId(isSelected ? null : message.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-[#abb2bf] flex-1">{message.instruction}</p>
                        {message.error ? (
                          <span className="text-xs text-red-400 flex-shrink-0">Error</span>
                        ) : message.rewrittenContent ? (
                          <span className="text-xs text-green-400 flex-shrink-0">Ready</span>
                        ) : (
                          <span className="text-xs text-[#5c6370] flex-shrink-0">Processing...</span>
                        )}
                      </div>
                    </div>
                    {message.rewrittenContent && onShowDiffInEditor && (
                      <div className="mt-2 pt-2 border-t border-[#2d2d2d]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onShowDiffInEditor(originalContent, message.rewrittenContent!)
                          }}
                          className="w-full px-3 py-1.5 text-xs bg-[#0e639c] text-white hover:bg-[#1177bb] rounded transition-colors"
                        >
                          Show in Editor
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Diff View - Only show when selected */}
                  {isSelected && hasResult && (
                    <div className="h-64 border-t border-[#2d2d2d]">
                      {message.error ? (
                        <div className="p-4 bg-red-900/20 text-red-400 text-sm">{message.error}</div>
                      ) : message.rewrittenContent ? (
                        <div className="h-full flex flex-col">
                          <div className="flex-1 overflow-hidden">
                            <DiffEditor
                              height="100%"
                              width="100%"
                              original={originalContent}
                              modified={message.rewrittenContent}
                              language={language}
                              theme="one-dark"
                              options={{
                                readOnly: true,
                                fontSize: 11,
                                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                scrollbar: {
                                  vertical: 'auto',
                                  horizontal: 'auto',
                                },
                                lineNumbers: 'off',
                                glyphMargin: false,
                                folding: true,
                                renderSideBySide: true,
                                ignoreTrimWhitespace: false,
                                renderIndicators: true,
                              }}
                              onMount={(editor) => {
                                // Add click handler to navigate to editor
                                if (onNavigateToLine) {
                                  const originalEditor = editor.getOriginalEditor()
                                  const modifiedEditor = editor.getModifiedEditor()

                                  // Handle click on original editor (left side)
                                  originalEditor.onMouseDown((e: any) => {
                                    if (e.target?.position) {
                                      const lineNumber = e.target.position.lineNumber
                                      onNavigateToLine(lineNumber)
                                    }
                                  })

                                  // Handle click on modified editor (right side)
                                  modifiedEditor.onMouseDown((e: any) => {
                                    if (e.target?.position) {
                                      const lineNumber = e.target.position.lineNumber
                                      onNavigateToLine(lineNumber)
                                    }
                                  })
                                }
                              }}
                              beforeMount={(monaco) => {
                                monaco.editor.defineTheme('one-dark', ONE_DARK_THEME)

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

                                if (tampermonkeyTypings) {
                                  monaco.languages.typescript.typescriptDefaults.addExtraLib(tampermonkeyTypings, 'file:///typings.d.ts')
                                  monaco.languages.typescript.javascriptDefaults.addExtraLib(tampermonkeyTypings, 'file:///typings.d.ts')
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2 p-2 border-t border-[#2d2d2d] bg-[#252526]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedMessageId(null)
                              }}
                              className="px-3 py-1 text-xs text-[#d4d4d4] hover:text-white hover:bg-[#2d2d2d] rounded transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAccept(message.id)
                              }}
                              className="px-3 py-1 text-xs bg-[#059669] text-white hover:bg-[#047857] rounded transition-colors flex items-center gap-1"
                            >
                              <FiCheck className="w-3 h-3" />
                              Accept
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Input Area - Bottom */}
      <div className="border-t border-[#2d2d2d] p-4 flex-shrink-0 bg-[#1e1e1e]">
        <div className="space-y-2">
          <textarea
            ref={instructionTextareaRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleRewrite()
              }
            }}
            disabled={isLoading}
            placeholder="Describe what you want to change... (e.g., 'Add error handling', 'Optimize performance')"
            className="w-full h-20 px-3 py-2 bg-[#252526] border border-[#2d2d2d] rounded text-[#cccccc] placeholder-[#858585] focus:outline-none focus:ring-2 focus:ring-[#0e639c] disabled:opacity-50 disabled:cursor-not-allowed resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-xs text-[#5c6370]">Press Cmd/Ctrl + Enter to submit</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5c6370]">Model:</span>
                <span className="text-xs text-[#61afef] font-medium">GEMINI</span>
              </div>
            </div>
            <button
              onClick={handleRewrite}
              disabled={isLoading || !instruction.trim()}
              className="px-4 py-1.5 bg-[#0e639c] text-white hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center justify-center gap-2 text-sm"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 flex items-center justify-center">
                    <Spinner />
                  </span>
                  <span>Sending...</span>
                </>
              ) : (
                <span>Send</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
