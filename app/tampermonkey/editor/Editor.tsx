'use client'

import { useRequest } from 'ahooks'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { updateFiles } from '@/app/api/scripts/actions'
import CodeEditor from '@/components/Editor/CodeEditor'
import { EDITOR_SUPPORTED_EXTENSIONS, ENTRY_SCRIPT_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'

import EditorHeader from './EditorHeader'
import FileTree from './FileTree'
import { TAMPERMONKEY_TYPINGS } from './typings'
import { useEditorManager } from './useEditorManager'
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
}

const EDITOR_DEV_MODE_STORAGE_KEY = 'editor-dev-mode-enabled'

export default function Editor(props: EditorProps) {
  const { files: inFiles, scriptKey, updatedAt } = props
  const router = useRouter()
  const editorManager = useEditorManager(inFiles, scriptKey, updatedAt)
  // Initialize as false to avoid hydration mismatch, restore from localStorage in useEffect
  const [isEditorDevMode, setIsEditorDevMode] = useState(false)
  const hostIdRef = useRef<string | null>(null)
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

  return (
    <div className="w-screen h-screen flex flex-col bg-black">
      <EditorHeader
        scriptKey={scriptKey}
        onSave={save}
        isSaving={loading}
        isEditorDevMode={isEditorDevMode}
        onToggleEditorDevMode={handleToggleEditorDevMode}
        isCompiling={isCompiling}
      />
      <div className="flex-1 flex overflow-hidden">
        <FileTree
          files={editorFiles}
          selectedFile={editorManager.selectedFile}
          onSelectFile={editorManager.setSelectedFile}
          onDeleteFile={editorManager.deleteFile}
          onAddFile={editorManager.addFile}
          onRenameFile={editorManager.renameFile}
          getFileState={editorManager.getFileState}
          errorPaths={editorManager.errorPaths}
        />
        <div className="flex-1 relative">
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
              extraLibs={[{ content: TAMPERMONKEY_TYPINGS, filePath: 'file:///typings.d.ts' }]}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">No file selected</p>
                <p className="text-sm">Select a file from the sidebar to start editing</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
