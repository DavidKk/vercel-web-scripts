'use client'

import { useRequest } from 'ahooks'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { rewriteCode } from '@/app/api/ai/actions'
import { updateFiles } from '@/app/api/scripts/actions'
import CodeEditor, { type CodeEditorRef } from '@/components/Editor/CodeEditor'
import { EDITOR_SUPPORTED_EXTENSIONS, ENTRY_SCRIPT_FILE, ENTRY_SCRIPT_RULES_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'
import type { RuleConfig } from '@/services/tampermonkey/types'

import { AIPanel } from './components/AIPanel'
import EditorHeader from './components/EditorHeader'
import FileTree from './components/FileTree'
import { Resizer } from './components/Resizer'
import { RulePanel } from './components/RulePanel'
import TabBar from './components/TabBar'
import { useEditorManager } from './hooks/useEditorManager'
import { draftStorage } from './services/draftStorage'
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

/**
 * PostMessage type for communicating with Tampermonkey script
 */
const EDITOR_POST_MESSAGE_TYPE = 'web-script-editor-message'

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
  rules: RuleConfig[]
}

const EDITOR_DEV_MODE_STORAGE_KEY = 'editor-dev-mode-enabled'

/**
 * Early initialization to notify Tampermonkey script about DEV MODE status
 * This prevents race conditions with Tampermonkey script checking DEV MODE status
 */
if (typeof window !== 'undefined') {
  const isDevModeEnabled = localStorage.getItem(EDITOR_DEV_MODE_STORAGE_KEY) === 'true'
  if (isDevModeEnabled) {
    // Send early message to Tampermonkey script immediately
    const tempHost = `editor-early-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Use setTimeout to ensure this runs after Tampermonkey script is ready
    setTimeout(() => {
      window.postMessage(
        {
          type: EDITOR_POST_MESSAGE_TYPE,
          message: {
            type: 'editor-dev-mode-early-init',
            host: tempHost,
          },
        },
        window.location.origin
      )

      // eslint-disable-next-line no-console
      console.log('[Editor Early Init] Sent early DEV MODE notification to Tampermonkey')
    }, 100) // Small delay to ensure Tampermonkey script is listening
  }
}

export default function Editor(props: EditorProps) {
  const { files: inFiles, scriptKey, updatedAt, tampermonkeyTypings, rules: initialRules } = props
  const router = useRouter()

  // Add rules file to files for editorManager
  // Use useMemo to prevent infinite loop from object reference changes
  const filesWithRules = useMemo(() => {
    return {
      ...inFiles,
      [ENTRY_SCRIPT_RULES_FILE]: {
        content: JSON.stringify(initialRules, null, 2),
        rawUrl: '',
      },
    }
  }, [inFiles, initialRules])

  const editorManager = useEditorManager(filesWithRules, scriptKey, updatedAt)
  // Initialize as false to avoid hydration mismatch, restore from localStorage in useEffect
  const [isEditorDevMode, setIsEditorDevMode] = useState(false)
  const [rightPanelType, setRightPanelType] = useState<'ai' | 'rules' | null>(null)
  const [selectedDiffMessage, setSelectedDiffMessage] = useState<{ original: string; modified: string } | null>(null)
  // Maintain TAB order: use array to preserve opening order
  const [openFiles, setOpenFiles] = useState<string[]>([])
  // Panel widths for resizable panels
  const [leftPanelWidth, setLeftPanelWidth] = useState(250)
  const [rightPanelWidth, setRightPanelWidth] = useState(400)
  // Rules state
  const [rules, setRules] = useState<RuleConfig[]>(initialRules)
  const [hasRuleChanges, setHasRuleChanges] = useState(false)
  const hostIdRef = useRef<string | null>(null)
  const codeEditorRef = useRef<CodeEditorRef>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastSentFilesHashRef = useRef<string | null>(null)
  const handleCompileRef = useRef<(() => Promise<void>) | null>(null)

  // Restore dev mode state from localStorage after mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedDevMode = localStorage.getItem(EDITOR_DEV_MODE_STORAGE_KEY) === 'true'
      if (savedDevMode) {
        setIsEditorDevMode(true)
      }
    }
  }, [])

  // Load rules draft from IndexedDB on mount and sync with editorManager
  useEffect(() => {
    async function loadRulesDraft() {
      if (!editorManager.isInitialized) {
        return
      }

      try {
        const drafts = await draftStorage.getFiles(scriptKey)
        if (drafts && drafts[ENTRY_SCRIPT_RULES_FILE]) {
          const draft = drafts[ENTRY_SCRIPT_RULES_FILE]
          // If draft is newer than initial load, use it
          if (draft.content && draft.updatedAt > updatedAt) {
            try {
              const draftRules = JSON.parse(draft.content)
              if (Array.isArray(draftRules)) {
                setRules(draftRules)
                setHasRuleChanges(true)
                // Update editorManager with draft content
                editorManager.updateFileContent(ENTRY_SCRIPT_RULES_FILE, draft.content)
              }
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('Failed to parse rules draft:', error)
            }
          }
        }
      } catch (error) {
        // Handle IndexedDB errors
        // eslint-disable-next-line no-console
        console.error('Failed to load rules draft from IndexedDB:', error)
        // Continue without draft loading - rules will use initialRules
      }
    }
    loadRulesDraft()
  }, [scriptKey, updatedAt, editorManager.isInitialized])

  // Sync rules when props change (e.g., after save and refresh)
  useEffect(() => {
    if (!hasRuleChanges) {
      setRules(initialRules)
    }
  }, [initialRules, hasRuleChanges])

  // Use custom hook to handle page leave confirmation
  useBeforeUnload(editorManager.hasUnsavedChanges || hasRuleChanges, 'You have unsaved changes. Are you sure you want to leave?')

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

  // Update editor content when selected file changes
  useEffect(() => {
    async function updateEditorContent() {
      // Wait for editor to be ready before switching files
      if (!codeEditorRef.current || !editorManager.selectedFile) {
        return
      }

      // Check if editor is ready, if not wait for it
      if (!codeEditorRef.current.isReady()) {
        // Wait for editor to be ready (max 5 seconds timeout)
        const maxWaitTime = 5000
        const startTime = Date.now()
        while (!codeEditorRef.current.isReady() && Date.now() - startTime < maxWaitTime) {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        // If still not ready after timeout, skip file switch
        if (!codeEditorRef.current.isReady()) {
          // eslint-disable-next-line no-console
          console.warn('[Editor] Editor not ready, cannot switch file')
          return
        }
      }

      const newContent = editorManager.getCurrentFileContent()

      // Use forceUpdate=true for file switching to ensure content is updated
      // setContent is now async and will wait for editor to be ready
      await codeEditorRef.current.setContent(newContent, true)
    }

    updateEditorContent()
  }, [editorManager.selectedFile])

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
   * Fetch rules from local tampermonkey.rules.json file
   * @returns Rules array from local file
   */
  function fetchRulesFromLocal(): RuleConfig[] {
    try {
      // Get rules file content from editorManager
      // First try to get from fileContentsRef (current content), then from committedFiles
      const currentContent = editorManager.fileContentsRef.current[ENTRY_SCRIPT_RULES_FILE]
      const committedContent = editorManager.committedFiles[ENTRY_SCRIPT_RULES_FILE]?.content
      const rulesContent = currentContent || committedContent

      if (!rulesContent) {
        return initialRules
      }

      const rules = JSON.parse(rulesContent)
      if (Array.isArray(rules)) {
        return rules
      }

      return initialRules
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse rules from local file:', error)
      return initialRules // Fallback to initial rules
    }
  }

  /**
   * Handle file selection - switch to the selected file
   * VS Code behavior:
   * - If current file has no changes, switch TAB (replace current TAB)
   * - If current file has changes, open new TAB (keep current TAB)
   * Also refreshes rules if the selected file is a script file
   * @param filePath Path of the file to switch to
   */
  async function handleFileSelect(filePath: string) {
    editorManager.setSelectedFile(filePath)
    // TAB management is handled in useEffect based on file changes

    // Refresh rules when selecting a script file
    if (SCRIPTS_FILE_EXTENSION.some((ext) => filePath.endsWith(ext))) {
      const freshRules = fetchRulesFromLocal()
      setRules(freshRules)
      // Reset rule changes flag since we're loading fresh rules from local file
      setHasRuleChanges(false)
    }
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
      const filesToUpdate = []

      // Save file changes
      if (editorManager.hasUnsavedChanges) {
        const snapshot = editorManager.getDirtySnapshot()

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
      }

      // Save rule changes
      if (hasRuleChanges) {
        // Filter out empty rules (wildcard is empty or only whitespace)
        const filteredRules = rules.filter((rule) => rule.wildcard && rule.wildcard.trim().length > 0)
        const rulesContent = JSON.stringify(filteredRules, null, 2)
        filesToUpdate.push({ file: ENTRY_SCRIPT_RULES_FILE, content: rulesContent })
      }

      if (filesToUpdate.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[Save] No changes to save')
        return
      }

      await updateFiles(...filesToUpdate)

      // Mark files as saved to reset hasUnsavedChanges
      if (editorManager.hasUnsavedChanges) {
        editorManager.markAsSaved()
      }

      // Reset rule changes and clear local draft
      if (hasRuleChanges) {
        setHasRuleChanges(false)
        // Clear rules draft from IndexedDB after successful save
        try {
          const drafts = await draftStorage.getFiles(scriptKey)
          if (drafts && drafts[ENTRY_SCRIPT_RULES_FILE]) {
            const updatedDrafts = { ...drafts }
            delete updatedDrafts[ENTRY_SCRIPT_RULES_FILE]
            if (Object.keys(updatedDrafts).length === 0) {
              await draftStorage.clearFiles(scriptKey)
            } else {
              await draftStorage.saveFiles(scriptKey, updatedDrafts)
            }
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to clear rules draft from IndexedDB:', error)
          // Don't block the save process if draft cleanup fails
        }
      }

      // Refresh the page to get the latest files from the server
      router.refresh()
    },
    {
      manual: true,
      throttleWait: 1e3,
    }
  )

  /**
   * Handle rules change
   * @param updatedRules Updated rule configurations
   */
  function handleRulesChange(updatedRules: RuleConfig[]) {
    setRules(updatedRules)
    setHasRuleChanges(true)

    // Update editorManager with new rules content to show file as edited
    updateRulesInEditorManager()
  }

  /**
   * Update rules content in editorManager
   * This makes the rules file show as edited in the file tree
   */
  function updateRulesInEditorManager() {
    // Filter out empty rules
    const filteredRules = rules.filter((rule) => rule.wildcard && rule.wildcard.trim().length > 0)
    const rulesContent = JSON.stringify(filteredRules, null, 2)

    // Update editorManager with current rules content
    // This will mark the file as having changes
    editorManager.updateFileContent(ENTRY_SCRIPT_RULES_FILE, rulesContent)
  }

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

      // Filter files for dev mode compilation
      // Include: .ts, .js files and rules file; Exclude: main script, config files, declaration files, empty content
      const files: Record<string, string> = {}
      const filteredFiles: string[] = []

      for (const [file, content] of Object.entries(snapshot)) {
        // Always exclude the main generated script file
        if (file === ENTRY_SCRIPT_FILE) {
          filteredFiles.push(`${file} (main script - excluded)`)
          continue
        }

        // Exclude config files
        if (CONFIG_FILES.includes(file)) {
          filteredFiles.push(`${file} (config file - excluded)`)
          continue
        }

        // Exclude declaration files
        if (isDeclarationFile(file)) {
          filteredFiles.push(`${file} (declaration file - excluded)`)
          continue
        }

        // Exclude files with no content
        if (!content) {
          filteredFiles.push(`${file} (empty content - excluded)`)
          continue
        }

        // Include all other files (including .ts, .js, and .json files like rules)
        files[file] = content
      }

      // eslint-disable-next-line no-console
      console.log('[Editor Dev Mode] File processing:', {
        totalFiles: Object.keys(snapshot).length,
        validFiles: Object.keys(files),
        filteredFiles,
      })

      if (Object.keys(files).length === 0) {
        // eslint-disable-next-line no-console
        console.warn('[Editor Dev Mode] No script files found for DEV MODE.', {
          suggestion: 'Please create .ts or .js files in your project',
          howTo: 'Click the "+" button in the file tree to add a new TypeScript file',
          allFiles: Object.keys(snapshot),
          filteredOut: filteredFiles,
        })

        // Send a special message to indicate DEV MODE is active but no files available
        if (channelRef.current && hostIdRef.current) {
          const message = {
            type: 'editor-no-files',
            host: hostIdRef.current,
            lastModified: Date.now(),
            files: {},
            compiledContent: '',
            message: 'DEV MODE active but no script files found. Please create .ts or .js files.',
          }
          channelRef.current.postMessage(message)

          // Also send postMessage for Tampermonkey script compatibility
          window.postMessage(
            {
              type: EDITOR_POST_MESSAGE_TYPE,
              message,
            },
            window.location.origin
          )
        }
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

        // Also send postMessage for Tampermonkey script compatibility
        window.postMessage(
          {
            type: EDITOR_POST_MESSAGE_TYPE,
            message,
          },
          window.location.origin
        )

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
  const handleCompile = async () => {
    // Update rules content in editorManager first
    updateRulesInEditorManager()

    // Then persist all files (including rules) to local storage
    await editorManager.persistLocal()

    if (isEditorDevMode && editorManager.hasUnsavedChanges) {
      sendEditorFiles(true) // Force compilation
    }
  }

  // Update handleCompile ref
  useEffect(() => {
    handleCompileRef.current = handleCompile
  }, [handleCompile])

  // Handle CMD+S / CTRL+S globally to prevent browser save dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check for CMD+S (Mac) or CTRL+S (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        if (handleCompileRef.current) {
          handleCompileRef.current()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Initialize editor dev mode
  useEffect(() => {
    if (!isEditorDevMode) {
      // Cleanup when disabling
      if (hostIdRef.current) {
        // Notify via BroadcastChannel
        if (channelRef.current) {
          const message = {
            type: 'editor-dev-mode-stopped',
            host: hostIdRef.current,
          }
          channelRef.current.postMessage(message)

          // Also send postMessage for Tampermonkey script compatibility
          window.postMessage(
            {
              type: EDITOR_POST_MESSAGE_TYPE,
              message,
            },
            window.location.origin
          )

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

      // Also send postMessage for Tampermonkey script compatibility
      window.postMessage(
        {
          type: EDITOR_POST_MESSAGE_TYPE,
          message,
        },
        window.location.origin
      )

      // eslint-disable-next-line no-console
      console.log('[Editor Dev Mode] Started, sending message:', message)

      // Send initial snapshot (force send to ensure script execution after refresh)
      // After refresh, we need to force send even if hash hasn't changed
      // because GM_setValue might have been cleared or the script tab needs to receive the update
      lastSentFilesHashRef.current = null

      // Small delay to ensure early init message is processed first
      setTimeout(() => {
        sendEditorFiles(true) // Force compilation and broadcast
      }, 50)
    }

    // Cleanup on unmount
    return () => {
      if (hostIdRef.current) {
        // Notify via BroadcastChannel that host is stopping
        if (channelRef.current) {
          const message = {
            type: 'editor-dev-mode-stopped',
            host: hostIdRef.current,
          }
          channelRef.current.postMessage(message)

          // Also send postMessage for Tampermonkey script compatibility
          window.postMessage(
            {
              type: EDITOR_POST_MESSAGE_TYPE,
              message,
            },
            window.location.origin
          )

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
          const message = {
            type: 'editor-dev-mode-stopped',
            host: hostIdRef.current,
          }
          channelRef.current.postMessage(message)

          // Also send postMessage for Tampermonkey script compatibility
          window.postMessage(
            {
              type: EDITOR_POST_MESSAGE_TYPE,
              message,
            },
            window.location.origin
          )

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
   * Handle reset file to original content
   * @param filePath Path of the file to reset
   */
  function handleResetFile(filePath: string) {
    editorManager.resetFileContent(filePath)
    // The editor will automatically update when getCurrentFileContent changes
  }

  /**
   * Handle show diff for a file
   * @param filePath Path of the file to show diff
   */
  function handleShowDiff(filePath: string) {
    const committedContent = editorManager.committedFiles[filePath]?.content || ''
    const currentContent = editorManager.getCurrentFileContent() || ''

    // If this file is currently selected, show diff in editor
    if (editorManager.selectedFile === filePath) {
      setSelectedDiffMessage({
        original: committedContent,
        modified: currentContent,
      })
    } else {
      // Otherwise, select the file first, then show diff
      editorManager.setSelectedFile(filePath)
      // Use setTimeout to ensure the file is selected before showing diff
      setTimeout(() => {
        setSelectedDiffMessage({
          original: committedContent,
          modified: editorManager.getCurrentFileContent() || '',
        })
      }, 100)
    }
  }

  /**
   * Get committed content for a file
   * @param filePath Path of the file
   * @returns Committed content or null
   */
  function getCommittedContent(filePath: string): string | null {
    return editorManager.committedFiles[filePath]?.content || null
  }

  /**
   * Get current content for a file
   * @param filePath Path of the file
   * @returns Current content or null
   */
  function getCurrentContent(filePath: string): string | null {
    if (editorManager.deletedFiles.has(filePath)) {
      return null
    }
    // Use getCurrentFileContent if it's the selected file, otherwise get from refs
    if (editorManager.selectedFile === filePath) {
      return editorManager.getCurrentFileContent()
    }
    return editorManager.fileContentsRef.current[filePath] ?? editorManager.committedFiles[filePath]?.content ?? null
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
    setRightPanelType((prev) => (prev === 'ai' ? null : 'ai'))
  }

  /**
   * Handle Rules panel toggle
   */
  function handleToggleRulesPanel() {
    setRightPanelType((prev) => (prev === 'rules' ? null : 'rules'))
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
        isAIOpen={rightPanelType === 'ai'}
        isAIDisabled={!editorManager.selectedFile}
        onToggleRules={handleToggleRulesPanel}
        isRulesOpen={rightPanelType === 'rules'}
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Left: File Tree - Resizable Width */}
        <div className="flex-shrink-0" style={{ width: `${leftPanelWidth}px` }}>
          <FileTree
            files={editorFiles}
            selectedFile={editorManager.selectedFile}
            onSelectFile={handleFileSelect}
            onDeleteFile={editorManager.deleteFile}
            onAddFile={editorManager.addFile}
            onRenameFile={editorManager.renameFile}
            getFileState={editorManager.getFileState}
            errorPaths={editorManager.errorPaths}
            onResetFile={handleResetFile}
            onShowDiff={handleShowDiff}
            getCommittedContent={getCommittedContent}
            getCurrentContent={getCurrentContent}
          />
        </div>

        {/* Left Resizer */}
        <Resizer initialWidth={leftPanelWidth} minWidth={150} maxWidth={600} onResize={setLeftPanelWidth} storageKey="editor-left-panel-width" />

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
          <div className="flex-1 min-w-0 relative" style={{ minHeight: 0 }}>
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

        {/* Right: Panel (AI or Rules) - Resizable Width */}
        {rightPanelType && (
          <>
            {/* Right Resizer */}
            <Resizer
              initialWidth={rightPanelWidth}
              minWidth={300}
              maxWidth={800}
              onResize={(newWidth) => {
                setRightPanelWidth(newWidth)
              }}
              storageKey="editor-right-panel-width"
              reverse={true}
            />
            <div className="flex-shrink-0" style={{ width: `${rightPanelWidth}px` }}>
              {rightPanelType === 'ai' &&
                editorManager.selectedFile &&
                (() => {
                  const fileLanguage = getFileLanguage(editorManager.selectedFile!)
                  // Only show AI panel for TypeScript and JavaScript files
                  if (fileLanguage === 'json') {
                    return null
                  }
                  return (
                    <AIPanel
                      isOpen={true}
                      onClose={() => setRightPanelType(null)}
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
                  )
                })()}
              {rightPanelType === 'rules' && <RulePanel allRules={rules} selectedFile={editorManager.selectedFile} onRulesChange={handleRulesChange} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
