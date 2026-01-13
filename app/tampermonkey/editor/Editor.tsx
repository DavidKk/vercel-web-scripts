'use client'

import { useRequest } from 'ahooks'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { rewriteCode } from '@/app/api/ai/actions'
import { updateFiles } from '@/app/api/scripts/actions'
import CodeEditor, { type CodeEditorRef } from '@/components/Editor/CodeEditor'
import { EDITOR_SUPPORTED_EXTENSIONS, ENTRY_SCRIPT_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'

import { AIPanel } from './components/AIPanel'
import EditorHeader from './components/EditorHeader'
import FileTree from './components/FileTree'
import TabBar from './components/TabBar'
import { useEditorManager } from './hooks/useEditorManager'
import { calculateFilesHash, CONFIG_FILES, isDeclarationFile } from './utils'

/**
 * Generate a unique host ID for this editor instance
 */
function generateHostId(): string {
  return `editor-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * BroadcastChannel for editor dev mode communication
 */
const EDITOR_DEV_CHANNEL_NAME = 'web-script-dev'

export interface EditorProps {
  files: Record<
    string,
    {
      content: string
      rawUrl: string
    }
  >
  scriptKey: string
  updatedAt: number
  tampermonkeyTypings: string
}

const EDITOR_DEV_MODE_STORAGE_KEY = 'editor-dev-mode-enabled'

export default function Editor(props: EditorProps) {
  const { files: inFiles, scriptKey, updatedAt, tampermonkeyTypings } = props
  const router = useRouter()
  const editorManager = useEditorManager(inFiles, scriptKey, updatedAt)
  // Initialize as false to avoid hydration mismatch, restore from localStorage in useEffect
  const [isEditorDevMode, setIsEditorDevMode] = useState(false)
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false)
  const [selectedDiffMessage, setSelectedDiffMessage] = useState<{ original: string; modified: string } | null>(null)
  // Maintain TAB order: use array to preserve opening order
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const hostIdRef = useRef<string | null>(null)
  const codeEditorRef = useRef<CodeEditorRef>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastSentFilesHashRef = useRef<string | null>(null)

  // Restore dev mode state from localStorage after mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDevMode = localStorage.getItem(EDITOR_DEV_MODE_STORAGE_KEY) === 'true'
      if (savedDevMode) {
        setIsEditorDevMode(true)
      }
    }
  }, [])

  // Use custom hook to handle page leave confirmation
  useBeforeUnload(editorManager.hasUnsavedChanges, 'You have unsaved changes. Are you sure you want to leave?')

  // Track previous selected file to handle TAB switching logic
  const previousSelectedFileRef = useRef<string | null>(null)

  // Initialize open files with selected file
  useEffect(() => {
    if (editorManager.selectedFile && openFiles.length === 0) {
      setOpenFiles([editorManager.selectedFile])
      previousSelectedFileRef.current = editorManager.selectedFile
    }
  }, [])

  // VS Code style TAB management:
  // 1. Current file always stays in openFiles (default TAB)
  // 2. When switching files:
  //    - If previous file has no changes, remove it from openFiles (switch TAB - replace)
  //    - If previous file has changes, keep it in openFiles (open new TAB - keep old one)
  // 3. Files with changes are automatically pinned (stay in openFiles)
  // 4. Maintain TAB opening order (new tabs append to end, don't reorder)
  useEffect(() => {
    if (editorManager.selectedFile) {
      const currentFile = editorManager.selectedFile
      const previousFile = previousSelectedFileRef.current

      setOpenFiles((prev) => {
        const next = [...prev]

        // If current file is not in openFiles, add it to the end (maintain opening order)
        if (!next.includes(currentFile)) {
          next.push(currentFile)
        }

        // If switching from another file
        if (previousFile && previousFile !== currentFile) {
          // If previous file has no changes, remove it (switch TAB - replace behavior)
          if (!editorManager.hasFileChanges(previousFile)) {
            const index = next.indexOf(previousFile)
            if (index >= 0) {
              next.splice(index, 1)
            }
          }
          // If previous file has changes, keep it (open new TAB - keep old one)
        }

        return next
      })

      previousSelectedFileRef.current = currentFile
    }
  }, [editorManager.selectedFile, editorManager.hasFileChanges])

  // Pin files to openFiles when they get changes (TAB becomes fixed/pinned)
  // This ensures that once a file is edited, its TAB stays open
  // Watch unsavedPaths to immediately pin files when they are edited
  useEffect(() => {
    setOpenFiles((prev) => {
      const next = [...prev]
      let changed = false

      // Pin all files that have changes
      const allFiles = Object.keys(editorManager.files)
      for (const filePath of allFiles) {
        if (editorManager.hasFileChanges(filePath)) {
          if (!next.includes(filePath)) {
            next.push(filePath)
            changed = true
          }
        }
      }

      return changed ? next : prev
    })
  }, [editorManager.unsavedPaths, editorManager.hasFileChanges])

  /**
   * Handle file selection - switch to the selected file
   * VS Code behavior:
   * - If current file has no changes, switch TAB (replace current TAB)
   * - If current file has changes, open new TAB (keep current TAB)
   * @param filePath Path of the file to switch to
   */
  function handleFileSelect(filePath: string) {
    editorManager.setSelectedFile(filePath)
    // TAB management is handled in useEffect based on file changes
  }

  /**
   * Handle tab click - switch to the clicked file
   * @param filePath Path of the file to switch to
   */
  function handleTabClick(filePath: string) {
    handleFileSelect(filePath)
  }

  /**
   * Handle tab close - close the tab and switch to another file if needed
   * @param filePath Path of the file to close
   * @param event Mouse event
   */
  function handleTabClose(filePath: string, event: React.MouseEvent) {
    event.stopPropagation()

    // If closing the active file, switch to another open file first
    if (editorManager.selectedFile === filePath) {
      const remainingFiles = openFiles.filter((f) => f !== filePath)
      if (remainingFiles.length > 0) {
        // Try to find a file in the same directory first
        const currentDir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : ''
        const sameDirFile = remainingFiles.find((f) => f.startsWith(currentDir + '/') || (!f.includes('/') && currentDir === ''))
        editorManager.setSelectedFile(sameDirFile || remainingFiles[0])
      } else {
        editorManager.setSelectedFile(null)
      }
    }

    // Remove from open files (maintain order)
    setOpenFiles((prev) => prev.filter((f) => f !== filePath))
  }

  /**
   * Handle close tabs to the right
   * @param filePaths Array of file paths to close (already calculated in TabBar based on display order)
   */
  function handleCloseTabsToRight(filePaths: string[]) {
    if (filePaths.length === 0) {
      return
    }

    // Get remaining files before closing
    const remainingFiles = openFiles.filter((f) => !filePaths.includes(f))

    // Remove files from openFiles (maintain order)
    setOpenFiles((prev) => prev.filter((f) => !filePaths.includes(f)))

    // If current file is being closed, switch to the last remaining file
    if (editorManager.selectedFile && filePaths.includes(editorManager.selectedFile)) {
      if (remainingFiles.length > 0) {
        editorManager.setSelectedFile(remainingFiles[remainingFiles.length - 1])
      } else {
        // If all files are closed, select the first remaining file (should be the one that was right-clicked)
        const firstRemaining = Array.from(openFiles).find((f) => !filePaths.includes(f))
        if (firstRemaining) {
          editorManager.setSelectedFile(firstRemaining)
        } else {
          editorManager.setSelectedFile(null)
        }
      }
    }
  }

  /**
   * Handle close other tabs
   * @param filePath Path of the file to keep open
   */
  function handleCloseOtherTabs(filePath: string) {
    setOpenFiles([filePath])
    if (editorManager.selectedFile !== filePath) {
      editorManager.setSelectedFile(filePath)
    }
  }

  /**
   * Save files to server
   * Only saves if there are unsaved changes
   */
  const { run: save, loading } = useRequest(
    async () => {
      // Check if there are unsaved changes before saving
      if (!editorManager.hasUnsavedChanges) {
        // eslint-disable-next-line no-console
        console.log('[Save] No changes to save')
        return
      }

      const snapshot = editorManager.getDirtySnapshot()
      const filesToUpdate = []

      for (const [file, content] of Object.entries(snapshot)) {
        if (content === null) {
          filesToUpdate.push({ file, content: null })
          continue
        }

        if (!content.trim()) {
          alert(`File "${file}" cannot be empty.`)
          return
        }

        filesToUpdate.push({ file, content })
      }

      if (filesToUpdate.length === 0) {
        return
      }
      await updateFiles(...filesToUpdate)

      // Mark files as saved to reset hasUnsavedChanges
      editorManager.markAsSaved()
      // Refresh the page to get the latest files from the server
      router.refresh()
    },
    {
      manual: true,
      throttleWait: 1e3,
    }
  )

  /**
   * Compile and send editor files for dev mode
   * Only compiles and broadcasts when file content has changed (based on hash)
   * @param force If true, skip hash check and force compilation
   */
  const { run: sendEditorFiles, loading: isCompiling } = useRequest(
    async (force = false) => {
      if (!isEditorDevMode || !hostIdRef.current) {
        return
      }

      const snapshot = editorManager.getSnapshot()

      // Filter out ENTRY_SCRIPT_FILE, config files, declaration files, and null content
      const files: Record<string, string> = {}
      for (const [file, content] of Object.entries(snapshot)) {
        if (file === ENTRY_SCRIPT_FILE) {
          continue
        }

        if (CONFIG_FILES.includes(file)) {
          continue
        }

        if (isDeclarationFile(file)) {
          continue
        }

        if (!content) {
          continue
        }

        files[file] = content
      }

      if (Object.keys(files).length === 0) {
        return
      }

      // Calculate hash of current files to detect changes
      const currentHash = await calculateFilesHash(files)

      // If hash hasn't changed and not forced, skip compilation and broadcast
      if (!force && lastSentFilesHashRef.current === currentHash) {
        // eslint-disable-next-line no-console
        console.log('[Editor Dev Mode] Files unchanged, skipping compilation')
        return
      }

      // Compile files - if compilation fails, don't send update
      let compiledContent: string
      try {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        const response = await fetch(`${baseUrl}/tampermonkey/compile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ files }),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText)
          throw new Error(`Compilation failed: ${errorText || response.statusText}`)
        }

        compiledContent = await response.text()
        if (!compiledContent) {
          throw new Error('Compilation returned empty content')
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Editor Dev Mode] Compilation failed:', error)
        // Don't send update if compilation fails
        return
      }

      const lastModified = Date.now()

      // Send BroadcastChannel message with compiled content
      if (channelRef.current) {
        const message = {
          type: 'editor-files-updated',
          host: hostIdRef.current,
          lastModified,
          files,
          compiledContent,
        }
        channelRef.current.postMessage(message)
        // eslint-disable-next-line no-console
        console.log('[Editor Dev Mode] BroadcastChannel message sent:', {
          host: hostIdRef.current,
          lastModified,
          fileCount: Object.keys(files).length,
          files: Object.keys(files),
        })
      }

      // Update hash after successful broadcast
      lastSentFilesHashRef.current = currentHash
    },
    {
      manual: true,
      throttleWait: 1000,
    }
  )

  /**
   * Compile files (triggered by CMD+S)
   * Always persists to local IndexedDB, and also compiles if in dev mode
   */
  const handleCompile = () => {
    // Always persist to local storage on Cmd+S
    editorManager.persistLocal()

    if (isEditorDevMode && editorManager.hasUnsavedChanges) {
      sendEditorFiles(true) // Force compilation
    }
  }

  // Initialize editor dev mode
  useEffect(() => {
    if (!isEditorDevMode) {
      // Cleanup when disabling
      if (hostIdRef.current) {
        // Notify via BroadcastChannel
        if (channelRef.current) {
          channelRef.current.postMessage({
            type: 'editor-dev-mode-stopped',
            host: hostIdRef.current,
          })
          // eslint-disable-next-line no-console
          console.log('[Editor Dev Mode] Stopped, sending message')
        }

        hostIdRef.current = null
        // Reset hash when dev mode is disabled
        lastSentFilesHashRef.current = null
        // Clear localStorage when dev mode is disabled
        if (typeof window !== 'undefined') {
          localStorage.removeItem(EDITOR_DEV_MODE_STORAGE_KEY)
        }
      }
      return
    }

    // Generate host ID if not exists
    if (!hostIdRef.current) {
      hostIdRef.current = generateHostId()
    }

    // Initialize BroadcastChannel
    if (!channelRef.current) {
      channelRef.current = new BroadcastChannel(EDITOR_DEV_CHANNEL_NAME)
    }

    // Send initialization message
    if (channelRef.current && hostIdRef.current) {
      const message = {
        type: 'editor-dev-mode-started',
        host: hostIdRef.current,
      }
      channelRef.current.postMessage(message)
      // eslint-disable-next-line no-console
      console.log('[Editor Dev Mode] Started, sending message:', message)

      // Send initial snapshot (force send to ensure script execution after refresh)
      // After refresh, we need to force send even if hash hasn't changed
      // because GM_setValue might have been cleared or the script tab needs to receive the update
      lastSentFilesHashRef.current = null
      sendEditorFiles(true) // Force compilation and broadcast
    }

    // Cleanup on unmount
    return () => {
      if (hostIdRef.current) {
        // Notify via BroadcastChannel that host is stopping
        if (channelRef.current) {
          channelRef.current.postMessage({
            type: 'editor-dev-mode-stopped',
            host: hostIdRef.current,
          })
          // eslint-disable-next-line no-console
          console.log('[Editor Dev Mode] Stopped, sending message')
        }

        hostIdRef.current = null
        // Reset hash on cleanup
        lastSentFilesHashRef.current = null
      }

      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
      }
    }
  }, [isEditorDevMode, sendEditorFiles])

  /**
   * Toggle editor dev mode
   */
  const handleToggleEditorDevMode = () => {
    setIsEditorDevMode((prev) => {
      const newValue = !prev
      // Persist dev mode state to localStorage
      if (typeof window !== 'undefined') {
        if (newValue) {
          localStorage.setItem(EDITOR_DEV_MODE_STORAGE_KEY, 'true')
        } else {
          localStorage.removeItem(EDITOR_DEV_MODE_STORAGE_KEY)
        }
      }
      return newValue
    })
  }

  // Handle page unload to notify cleanup
  useEffect(() => {
    if (!isEditorDevMode || !hostIdRef.current || !channelRef.current) {
      return
    }

    const sendStopMessage = () => {
      if (channelRef.current && hostIdRef.current) {
        try {
          channelRef.current.postMessage({
            type: 'editor-dev-mode-stopped',
            host: hostIdRef.current,
          })
          // eslint-disable-next-line no-console
          console.log('[Editor Dev Mode] Page unloading, sent stop message')
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[Editor Dev Mode] Error sending stop message:', error)
        }
      }
    }

    const handleBeforeUnload = () => {
      sendStopMessage()
    }

    const handlePageHide = () => {
      sendStopMessage()
    }

    const handleVisibilityChange = () => {
      if (document.hidden && isEditorDevMode && hostIdRef.current && channelRef.current) {
        sendStopMessage()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isEditorDevMode])

  // Prepare files for editor (add meta to script files)
  const editorFiles = Object.fromEntries(
    (function* () {
      for (const [file, info] of Object.entries(editorManager.files)) {
        const { content, rawUrl } = info as { content: string; rawUrl: string }
        // Skip deleted files
        if (editorManager.deletedFiles.has(file)) {
          continue
        }

        // Only show supported files in the editor
        if (!EDITOR_SUPPORTED_EXTENSIONS.some((ext) => file.endsWith(ext))) {
          continue
        }

        // Only prepend meta to script files (.ts, .js)
        if (!SCRIPTS_FILE_EXTENSION.some((ext) => file.endsWith(ext))) {
          yield [file, { content, rawUrl }]
          continue
        }

        const meta = extractMeta(content)
        yield [file, { content: prependMeta(content, { ...meta, source: rawUrl }), rawUrl }]
      }
    })()
  )

  // Get current file language
  const getFileLanguage = (filePath: string): 'javascript' | 'typescript' | 'json' => {
    if (filePath.endsWith('.json')) {
      return 'json'
    }
    return filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript'
  }

  /**
   * Handle AI rewrite completion (accept)
   */
  function handleAIAccept(rewrittenContent: string) {
    if (!editorManager.selectedFile) {
      return
    }
    editorManager.updateFileContent(editorManager.selectedFile, rewrittenContent)
  }

  /**
   * Handle AI rewrite request
   */
  async function handleAIRewrite(instruction: string): Promise<string> {
    if (!editorManager.selectedFile) {
      throw new Error('No file selected')
    }

    const language = getFileLanguage(editorManager.selectedFile)
    if (language === 'json') {
      throw new Error('AI rewrite is not supported for JSON files')
    }

    try {
      const rewrittenContent = await rewriteCode(editorManager.getCurrentFileContent(), editorManager.selectedFile, instruction, tampermonkeyTypings, language)
      return rewrittenContent
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to rewrite code')
    }
  }

  /**
   * Handle AI panel toggle
   */
  function handleToggleAIPanel() {
    if (!editorManager.selectedFile) {
      alert('Please select a file first')
      return
    }
    setIsAIPanelOpen((prev) => !prev)
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-black">
      <EditorHeader
        scriptKey={scriptKey}
        onSave={save}
        isSaving={loading}
        isEditorDevMode={isEditorDevMode}
        onToggleEditorDevMode={handleToggleEditorDevMode}
        isCompiling={isCompiling}
        onToggleAI={handleToggleAIPanel}
        isAIOpen={isAIPanelOpen}
        isAIDisabled={!editorManager.selectedFile}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Left: File Tree - Fixed Width */}
        <div className="flex-shrink-0">
          <FileTree
            files={editorFiles}
            selectedFile={editorManager.selectedFile}
            onSelectFile={handleFileSelect}
            onDeleteFile={editorManager.deleteFile}
            onAddFile={editorManager.addFile}
            onRenameFile={editorManager.renameFile}
            getFileState={editorManager.getFileState}
            errorPaths={editorManager.errorPaths}
          />
        </div>

        {/* Middle: Code Editor - Flexible */}
        <div className="flex-1 min-w-0 relative flex flex-col">
          {/* Tab Bar */}
          {openFiles.length > 0 && (
            <TabBar
              tabs={openFiles.map((path) => ({ path, name: path.split('/').pop() || path }))}
              activeTab={editorManager.selectedFile}
              onTabClick={handleTabClick}
              onTabClose={handleTabClose}
              onCloseTabsToRight={handleCloseTabsToRight}
              onCloseOtherTabs={handleCloseOtherTabs}
              getFileState={editorManager.getFileState}
              hasError={(filePath) => editorManager.errorPaths.has(filePath)}
            />
          )}

          {/* Code Editor */}
          <div className="flex-1 min-w-0 relative">
            {editorManager.selectedFile ? (
              <CodeEditor
                content={editorManager.getCurrentFileContent()}
                path={editorManager.selectedFile}
                language={getFileLanguage(editorManager.selectedFile)}
                onChange={(content) => editorManager.updateFileContent(editorManager.selectedFile!, content)}
                onSave={async () => {
                  await handleCompile()
                  await editorManager.persistLocal()
                }}
                onValidate={(hasError) => editorManager.setFileHasError(editorManager.selectedFile!, hasError)}
                extraLibs={[{ content: tampermonkeyTypings, filePath: 'file:///typings.d.ts' }]}
                editorRef={codeEditorRef}
                diffMode={
                  selectedDiffMessage
                    ? {
                        original: selectedDiffMessage.original,
                        modified: selectedDiffMessage.modified,
                        onAccept: () => {
                          if (selectedDiffMessage) {
                            handleAIAccept(selectedDiffMessage.modified)
                            setSelectedDiffMessage(null)
                          }
                        },
                        onReject: () => {
                          setSelectedDiffMessage(null)
                        },
                      }
                    : undefined
                }
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e] text-[#858585]">
                <div className="text-center">
                  <p className="text-lg mb-2">No file selected</p>
                  <p className="text-sm">Select a file from the sidebar to start editing</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Panel - Fixed Width */}
        {editorManager.selectedFile &&
          (() => {
            const fileLanguage = getFileLanguage(editorManager.selectedFile!)
            // Only show AI panel for TypeScript and JavaScript files
            if (fileLanguage === 'json') {
              return null
            }
            return (
              <div className="flex-shrink-0">
                <AIPanel
                  isOpen={isAIPanelOpen}
                  onClose={() => setIsAIPanelOpen(false)}
                  onAccept={handleAIAccept}
                  originalContent={editorManager.getCurrentFileContent()}
                  filePath={editorManager.selectedFile}
                  language={fileLanguage}
                  tampermonkeyTypings={tampermonkeyTypings}
                  onRewrite={handleAIRewrite}
                  onNavigateToLine={(lineNumber) => {
                    if (codeEditorRef.current) {
                      codeEditorRef.current.navigateToLine(lineNumber)
                    }
                  }}
                  onShowDiffInEditor={(original, modified) => {
                    setSelectedDiffMessage({ original, modified })
                  }}
                />
              </div>
            )
          })()}
      </div>
    </div>
  )
}
