'use client'

import type { Project, VM } from '@stackblitz/sdk'
import Stackblitz from '@stackblitz/sdk'
import { useRequest } from 'ahooks'
import { useEffect, useRef, useState } from 'react'

import { updateFiles } from '@/app/api/scripts/actions'
import { Spinner } from '@/components/Spinner'
import { ENTRY_SCRIPT_FILE, SCRIPTS_FILE_EXTENSION } from '@/constants/file'
import { useBeforeUnload } from '@/hooks/useClient'
import { extractMeta, prependMeta } from '@/services/tampermonkey/meta'

/**
 * Stackblitz config files that should not be sent to dev mode
 */
const STACKBLITZ_CONFIG_FILES = ['package.json', 'tsconfig.json', 'typings.d.ts', '.gitignore', 'gitignore']

/**
 * Check if file is a TypeScript declaration file
 */
function isDeclarationFile(file: string): boolean {
  return file.endsWith('.d.ts')
}

import EditorHeader from './EditorHeader'

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
}

export default function Editor(props: EditorProps) {
  const { files: inFiles, scriptKey } = props
  const editorRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)
  const [vm, setVM] = useState<VM>()
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isEditorDevMode, setIsEditorDevMode] = useState(false)
  const hostIdRef = useRef<string | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastSentSnapshotRef = useRef<Record<string, string | null> | null>(null)

  // Use custom hook to handle page leave confirmation
  useBeforeUnload(hasUnsavedChanges, 'You have unsaved changes. Are you sure you want to leave?')

  const { run: save, loading } = useRequest(
    async () => {
      if (!vm) {
        return
      }

      const snapshot = await vm.getFsSnapshot()
      if (!snapshot) {
        return
      }

      const needUpdateFiles = Array.from<{ file: string; content: string | null }>(
        (function* () {
          for (const [file, content] of Object.entries(snapshot)) {
            if (file === ENTRY_SCRIPT_FILE) {
              continue
            }

            if (!content) {
              continue
            }

            yield { file, content }
          }
        })()
      )

      Object.entries(inFiles).forEach(([file]) => {
        if (needUpdateFiles.some(({ file: f }) => f === file)) {
          return
        }

        needUpdateFiles.push({ file, content: null })
      })

      await updateFiles(...needUpdateFiles)
      setHasUnsavedChanges(false)
    },
    {
      manual: true,
      throttleWait: 1e3,
    }
  )

  /**
   * Send editor files to API for dev mode
   */
  const { run: sendEditorFiles } = useRequest(
    async (snapshot: Record<string, string | null>) => {
      if (!isEditorDevMode || !hostIdRef.current) {
        return
      }

      // Filter out ENTRY_SCRIPT_FILE, config files, declaration files, and null content
      const files: Record<string, string> = {}
      for (const [file, content] of Object.entries(snapshot)) {
        if (file === ENTRY_SCRIPT_FILE) {
          continue
        }

        if (STACKBLITZ_CONFIG_FILES.includes(file)) {
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

      const lastModified = Date.now()

      // Send BroadcastChannel message with files content (like Local Dev Mode)
      if (channelRef.current) {
        const message = {
          type: 'editor-files-updated',
          host: hostIdRef.current,
          lastModified,
          files,
        }
        channelRef.current.postMessage(message)
        // eslint-disable-next-line no-console
        console.log('[Editor Dev Mode] BroadcastChannel message sent with files:', {
          host: hostIdRef.current,
          lastModified,
          fileCount: Object.keys(files).length,
          files: Object.keys(files),
        })
      }

      lastSentSnapshotRef.current = snapshot
    },
    {
      manual: true,
      throttleWait: 1000,
    }
  )

  // Monitor editor content changes
  useEffect(() => {
    if (!vm) return

    let checkInterval: NodeJS.Timeout | null = null
    let isUserActive = true

    /**
     * Check if any file content has changed
     */
    const checkForChanges = async () => {
      try {
        const snapshot = await vm.getFsSnapshot()
        if (!snapshot) {
          return
        }

        // Check if any file content has changed
        const hasChanges = Object.entries(snapshot).some(([file, content]) => {
          if (file === ENTRY_SCRIPT_FILE) {
            return false
          }

          if (!content) return false

          const originalFile = inFiles[file]
          return originalFile && originalFile.content !== content
        })

        setHasUnsavedChanges(hasChanges)

        // If editor dev mode is enabled, send files to API
        if (isEditorDevMode && hostIdRef.current) {
          // Check if snapshot has changed
          const hasSnapshotChanged =
            !lastSentSnapshotRef.current ||
            Object.keys(snapshot).some((file) => {
              if (file === ENTRY_SCRIPT_FILE) {
                return false
              }
              return snapshot[file] !== lastSentSnapshotRef.current?.[file]
            })

          if (hasSnapshotChanged) {
            sendEditorFiles(snapshot)
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking for changes:', error)
      }
    }

    /**
     * Handle user activity to adjust polling frequency
     */
    const handleUserActivity = () => {
      isUserActive = true
      // Reset interval to check more frequently when user is active
      if (checkInterval) {
        clearInterval(checkInterval)
      }
      checkInterval = setInterval(checkForChanges, isUserActive ? 1000 : 3000)
    }

    /**
     * Handle user inactivity
     */
    const handleUserInactivity = () => {
      isUserActive = false
      if (checkInterval) {
        clearInterval(checkInterval)
      }
      checkInterval = setInterval(checkForChanges, 3000)
    }

    // Initial check
    checkForChanges()

    // Set up polling with adaptive frequency based on user activity
    checkInterval = setInterval(checkForChanges, 1000)

    // Listen for user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true })
    })

    // Listen for user inactivity
    let inactivityTimer: NodeJS.Timeout
    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer)
      inactivityTimer = setTimeout(handleUserInactivity, 30000) // 30 seconds of inactivity
    }
    resetInactivityTimer()
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer, { passive: true })
    })

    return () => {
      if (checkInterval) {
        clearInterval(checkInterval)
      }
      clearTimeout(inactivityTimer)
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity)
        window.removeEventListener(event, resetInactivityTimer)
      })
    }
  }, [vm, inFiles, isEditorDevMode, sendEditorFiles])

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

      // Send initial snapshot
      if (vm) {
        vm.getFsSnapshot().then((snapshot) => {
          if (snapshot) {
            sendEditorFiles(snapshot)
          }
        })
      }
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
      }

      if (channelRef.current) {
        channelRef.current.close()
        channelRef.current = null
      }
    }
  }, [isEditorDevMode, vm, sendEditorFiles])

  useEffect(() => {
    // Prevent duplicate initialization (React Strict Mode will mount twice)
    if (isInitializedRef.current) {
      return
    }

    let isMounted = true
    let vmInstance: VM | null = null

    ;(async () => {
      if (!editorRef.current) {
        return
      }

      isInitializedRef.current = true

      const files = Object.fromEntries(
        (function* () {
          for (const [file, { content, rawUrl }] of Object.entries(inFiles)) {
            if (!SCRIPTS_FILE_EXTENSION.some((ext) => file.endsWith(ext))) {
              yield [file, content]
              continue
            }

            const meta = extractMeta(content)
            yield [file, prependMeta(content, { ...meta, source: rawUrl })]
          }
        })()
      )

      const project: Project = { template: 'javascript', title: 'test', files }
      if (!document.body.contains(editorRef.current)) {
        return
      }

      vmInstance = await Stackblitz.embedProject(editorRef.current, project, {
        view: 'editor',
        showSidebar: true,
      })

      // Only set VM if component is still mounted
      if (isMounted) {
        setVM(vmInstance)
      } else {
        vmInstance = null
        isInitializedRef.current = false
      }
    })()

    // Cleanup function: destroy Stackblitz instance when component unmounts
    return () => {
      isMounted = false
      if (vmInstance) {
        vmInstance = null
      }
      isInitializedRef.current = false
    }
  }, [])

  /**
   * Toggle editor dev mode
   * New host will replace old host directly (simple approach)
   */
  const handleToggleEditorDevMode = () => {
    setIsEditorDevMode((prev) => !prev)
  }

  // Handle page unload to notify cleanup
  // Use both beforeunload and pagehide for better reliability
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

    // beforeunload fires before page unloads (but may be unreliable)
    const handleBeforeUnload = () => {
      sendStopMessage()
    }

    // pagehide is more reliable and fires in more cases (including mobile)
    const handlePageHide = () => {
      sendStopMessage()
    }

    // visibilitychange can also help catch tab switches
    const handleVisibilityChange = () => {
      if (document.hidden && isEditorDevMode && hostIdRef.current && channelRef.current) {
        // When tab becomes hidden, send stop message as a safety measure
        // This helps if the page is closed while hidden
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

  return (
    <div className="w-screen h-screen flex flex-col bg-black">
      <EditorHeader scriptKey={scriptKey} onSave={save} isSaving={loading} isEditorDevMode={isEditorDevMode} onToggleEditorDevMode={handleToggleEditorDevMode} />
      <div className="flex-1 relative">
        <div ref={editorRef} className="w-full h-full"></div>

        {!vm && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-8 h-8 flex items-center justify-center">
              <Spinner />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
