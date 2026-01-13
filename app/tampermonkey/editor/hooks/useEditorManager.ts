'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { LocalFileRecord } from '../services/draftStorage'
import { draftStorage } from '../services/draftStorage'

interface FileContent {
  content: string
  rawUrl: string
}

/**
 * Hook to manage editor files state
 * @param initialFiles Initial files from server
 * @param scriptKey Script key identifier
 * @param gistUpdatedAt Gist last updated timestamp
 * @returns Editor manager object with file state and operations
 */
export function useEditorManager(initialFiles: Record<string, FileContent>, scriptKey: string, gistUpdatedAt: number) {
  // committedFiles tracks the files as they exist on the server (or after the last save)
  const [committedFiles, setCommittedFiles] = useState<Record<string, FileContent>>(initialFiles)
  const [selectedFile, setSelectedFile] = useState<string | null>(Object.keys(initialFiles).find((f) => !f.includes('/')) || Object.keys(initialFiles)[0] || null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [deletedFiles, setDeletedFiles] = useState<Set<string>>(new Set())
  const [addedFiles, setAddedFiles] = useState<Record<string, FileContent>>({})
  const [unsavedPaths, setUnsavedPaths] = useState<Set<string>>(new Set())
  const [errorPaths, setErrorPaths] = useState<Set<string>>(new Set())
  const [isInitialized, setIsInitialized] = useState(false)
  const fileContentsRef = useRef<Record<string, string>>({})
  const lastPersistedContentsRef = useRef<Record<string, string | null>>({})

  // Update committed files when prop changes (e.g. after router.refresh())
  useEffect(() => {
    setCommittedFiles(initialFiles)
  }, [initialFiles])

  // Conflict resolution and draft loading
  useEffect(() => {
    async function init() {
      const drafts = await draftStorage.getFiles(scriptKey)
      if (!drafts) {
        setIsInitialized(true)
        return
      }

      const newDeletedFiles = new Set<string>()
      const newAddedFiles: Record<string, FileContent> = {}
      const newFileContents: Record<string, string> = {}
      const persistedContents: Record<string, string | null> = {}

      // Compare each draft with remote
      Object.entries(drafts).forEach(([path, record]) => {
        // If local draft is newer than Gist update, use it
        if (record.updatedAt > gistUpdatedAt) {
          persistedContents[path] = record.content
          if (record.status === 'deleted' || record.content === null) {
            newDeletedFiles.add(path)
          } else if (record.status === 'added') {
            newAddedFiles[path] = { content: record.content, rawUrl: '' }
            newFileContents[path] = record.content
          } else {
            // modified
            newFileContents[path] = record.content
          }
        }
      })

      lastPersistedContentsRef.current = persistedContents
      if (newDeletedFiles.size > 0) setDeletedFiles(newDeletedFiles)
      if (Object.keys(newAddedFiles).length > 0) setAddedFiles(newAddedFiles)
      Object.assign(fileContentsRef.current, newFileContents)
      setIsInitialized(true)

      // Set hasUnsavedChanges if any draft was applied
      if (newDeletedFiles.size > 0 || Object.keys(newAddedFiles).length > 0 || Object.keys(newFileContents).length > 0) {
        setHasUnsavedChanges(true)
      }
    }
    init()
  }, [scriptKey, gistUpdatedAt])

  // Initialize file contents from committed files
  useEffect(() => {
    if (!isInitialized) return
    Object.keys(committedFiles).forEach((file) => {
      if (fileContentsRef.current[file] === undefined) {
        fileContentsRef.current[file] = committedFiles[file].content
      }
    })
  }, [committedFiles, isInitialized])

  /**
   * Get snapshot of only changed/added/deleted files
   * @returns Record of file paths to their content (null for deleted files)
   */
  const getDirtySnapshot = useCallback((): Record<string, string | null> => {
    const dirtySnapshot: Record<string, string | null> = {}

    // Add deleted files
    deletedFiles.forEach((file) => {
      dirtySnapshot[file] = null
    })

    // Add new files
    Object.keys(addedFiles).forEach((file) => {
      dirtySnapshot[file] = fileContentsRef.current[file] ?? ''
    })

    // Add changed files (excluding added/deleted)
    Object.entries(fileContentsRef.current).forEach(([file, content]) => {
      if (addedFiles[file] || deletedFiles.has(file)) return

      const original = committedFiles[file]
      if (original && original.content !== content) {
        dirtySnapshot[file] = content
      }
    })

    return dirtySnapshot
  }, [deletedFiles, addedFiles, committedFiles])

  /**
   * Mark files as saved (reset committed state to current state)
   */
  const markAsSaved = useCallback(async () => {
    const snapshot = fileContentsRef.current
    const newCommittedFiles: Record<string, FileContent> = {}

    // Process original files
    Object.keys(committedFiles).forEach((file) => {
      if (deletedFiles.has(file)) return
      newCommittedFiles[file] = {
        ...committedFiles[file],
        content: snapshot[file] ?? committedFiles[file].content,
      }
    })

    // Process added files
    Object.entries(addedFiles).forEach(([file, info]) => {
      if (deletedFiles.has(file)) return
      newCommittedFiles[file] = {
        ...info,
        content: snapshot[file] ?? info.content,
      }
    })

    setCommittedFiles(newCommittedFiles)
    setAddedFiles({})
    setDeletedFiles(new Set())
    setUnsavedPaths(new Set())
    setHasUnsavedChanges(false)

    // Clear local drafts after successful remote save
    await draftStorage.clearFiles(scriptKey)
    lastPersistedContentsRef.current = {}
  }, [deletedFiles, addedFiles, committedFiles, scriptKey])

  /**
   * Persist current dirty state to IndexedDB (as a draft)
   */
  const persistLocal = useCallback(async () => {
    const dirtySnapshot = getDirtySnapshot()
    if (Object.keys(dirtySnapshot).length === 0) {
      await draftStorage.clearFiles(scriptKey)
      lastPersistedContentsRef.current = {}
      setUnsavedPaths(new Set())
      setHasUnsavedChanges(false)
      return
    }

    const now = Date.now()
    const records: Record<string, LocalFileRecord> = {}

    Object.entries(dirtySnapshot).forEach(([path, content]) => {
      let status: 'modified' | 'added' | 'deleted' = 'modified'
      if (addedFiles[path]) status = 'added'
      else if (deletedFiles.has(path)) status = 'deleted'

      records[path] = {
        path,
        content,
        updatedAt: now,
        status,
      }
    })

    await draftStorage.saveFiles(scriptKey, records)
    lastPersistedContentsRef.current = dirtySnapshot
    setUnsavedPaths(new Set())
    setHasUnsavedChanges(true)
  }, [getDirtySnapshot, addedFiles, deletedFiles, scriptKey])

  /**
   * Update file content
   * @param filePath Path of the file to update
   * @param content New content
   */
  const updateFileContent = useCallback(
    (filePath: string, content: string) => {
      fileContentsRef.current[filePath] = content

      // If file was marked as deleted, unmark it if it's updated
      if (deletedFiles.has(filePath)) {
        setDeletedFiles((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
      }

      // Check for changes relative to Online
      const hasOnlineChanges = deletedFiles.has(filePath) || addedFiles[filePath] !== undefined || content !== committedFiles[filePath]?.content

      // Check for changes relative to Local (IndexedDB)
      const persistedContent = lastPersistedContentsRef.current[filePath] === undefined ? (committedFiles[filePath]?.content ?? null) : lastPersistedContentsRef.current[filePath]

      const isMemOnlyChange = content !== persistedContent

      if (isMemOnlyChange) {
        setUnsavedPaths((prev) => new Set(prev).add(filePath))
      } else {
        setUnsavedPaths((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
      }

      setHasUnsavedChanges(deletedFiles.size > 0 || Object.keys(addedFiles).length > 0 || unsavedPaths.size > 0 || hasOnlineChanges)
    },
    [deletedFiles, addedFiles, committedFiles, unsavedPaths]
  )

  /**
   * Add new file
   * @param filePath Path of the new file
   */
  const addFile = useCallback((filePath: string) => {
    const name = filePath.replace(/\.ts$/, '')
    const defaultContent = `// ==UserScript==
// @name         ${name}
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

`

    const newFile = { content: defaultContent, rawUrl: '' }
    setAddedFiles((prev) => ({ ...prev, [filePath]: newFile }))
    fileContentsRef.current[filePath] = defaultContent
    setSelectedFile(filePath)
    setUnsavedPaths((prev) => {
      const next = new Set(prev)
      next.add(filePath)
      return next
    })
    setHasUnsavedChanges(true)
  }, [])

  /**
   * Rename file
   * @param oldPath Old file path
   * @param newPath New file path
   */
  const renameFile = useCallback(
    (oldPath: string, newPath: string) => {
      if (oldPath === newPath) return

      // Update content ref
      const content = fileContentsRef.current[oldPath] ?? ''
      fileContentsRef.current[newPath] = content
      delete fileContentsRef.current[oldPath]

      if (addedFiles[oldPath]) {
        // Renaming a newly added file
        setAddedFiles((prev) => {
          const next = { ...prev }
          next[newPath] = next[oldPath]
          delete next[oldPath]
          return next
        })
        setUnsavedPaths((prev) => {
          const next = new Set(prev)
          next.add(newPath)
          next.delete(oldPath)
          return next
        })
      } else {
        // Renaming an existing file - mark old as deleted, new as added
        setDeletedFiles((prev) => {
          const next = new Set(prev)
          next.add(oldPath)
          return next
        })
        const info = committedFiles[oldPath]
        setAddedFiles((prev) => ({
          ...prev,
          [newPath]: { content, rawUrl: info?.rawUrl || '' },
        }))
        setUnsavedPaths((prev) => {
          const next = new Set(prev)
          next.add(oldPath)
          next.add(newPath)
          return next
        })
      }

      if (selectedFile === oldPath) {
        setSelectedFile(newPath)
      }
      setHasUnsavedChanges(true)
    },
    [addedFiles, selectedFile, committedFiles]
  )

  /**
   * Delete file
   * @param filePath Path of the file to delete
   */
  const deleteFile = useCallback(
    (filePath: string) => {
      if (addedFiles[filePath]) {
        setAddedFiles((prev) => {
          const next = { ...prev }
          delete next[filePath]
          return next
        })
        delete fileContentsRef.current[filePath]
        setUnsavedPaths((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
      } else {
        setDeletedFiles((prev) => {
          const next = new Set(prev)
          next.add(filePath)
          return next
        })
        setUnsavedPaths((prev) => new Set(prev).add(filePath))
      }

      if (selectedFile === filePath) {
        // Find another file to select
        const remaining = [...Object.keys(committedFiles), ...Object.keys(addedFiles)].filter((f) => f !== filePath && !deletedFiles.has(f))
        setSelectedFile(remaining[0] || null)
      }

      setHasUnsavedChanges(true)
    },
    [selectedFile, deletedFiles, addedFiles, committedFiles]
  )

  /**
   * Get current snapshot of all files
   * @returns Record of all file paths to their content
   */
  const getSnapshot = useCallback((): Record<string, string | null> => {
    const snapshot: Record<string, string | null> = { ...fileContentsRef.current }
    // Mark deleted files as null
    deletedFiles.forEach((file) => {
      snapshot[file] = null
    })
    return snapshot
  }, [deletedFiles])

  /**
   * Get current file content
   * @returns Content of the currently selected file
   */
  const getCurrentFileContent = useCallback((): string => {
    if (!selectedFile || deletedFiles.has(selectedFile)) return ''
    return fileContentsRef.current[selectedFile] ?? addedFiles[selectedFile]?.content ?? committedFiles[selectedFile]?.content ?? ''
  }, [selectedFile, committedFiles, deletedFiles, addedFiles])

  /**
   * Reset file content to original
   * @param filePath Path of the file to reset
   */
  const resetFileContent = useCallback(
    (filePath: string) => {
      if (addedFiles[filePath]) {
        setAddedFiles((prev) => {
          const next = { ...prev }
          delete next[filePath]
          return next
        })
        delete fileContentsRef.current[filePath]
        setUnsavedPaths((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
        if (selectedFile === filePath) setSelectedFile(null)
      } else if (committedFiles[filePath]) {
        const originalContent = committedFiles[filePath].content
        fileContentsRef.current[filePath] = originalContent
        setDeletedFiles((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
        setUnsavedPaths((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
        updateFileContent(filePath, originalContent)
      }
    },
    [committedFiles, updateFileContent, addedFiles, selectedFile]
  )

  /**
   * Check if file has unsaved changes
   * @param filePath Path of the file to check
   * @returns True if file has changes
   */
  const hasFileChanges = useCallback(
    (filePath: string): boolean => {
      return (
        deletedFiles.has(filePath) ||
        addedFiles[filePath] !== undefined ||
        (fileContentsRef.current[filePath] !== undefined && fileContentsRef.current[filePath] !== committedFiles[filePath]?.content)
      )
    },
    [committedFiles, deletedFiles, addedFiles]
  )

  /**
   * Get file state for indicator
   * @param filePath Path of the file
   * @returns File state: 'synced', 'local', or 'unsaved'
   */
  const getFileState = useCallback(
    (filePath: string): 'synced' | 'local' | 'unsaved' => {
      if (unsavedPaths.has(filePath)) return 'unsaved'

      const currentContent = deletedFiles.has(filePath) ? null : (fileContentsRef.current[filePath] ?? committedFiles[filePath]?.content ?? null)
      const committedContent = committedFiles[filePath]?.content ?? null

      return currentContent === committedContent ? 'synced' : 'local'
    },
    [committedFiles, deletedFiles, unsavedPaths]
  )

  /**
   * Set file error state
   * @param filePath Path of the file
   * @param hasError Whether the file has errors
   */
  const setFileHasError = useCallback((filePath: string, hasError: boolean) => {
    setErrorPaths((prev) => {
      const next = new Set(prev)
      if (hasError) {
        next.add(filePath)
      } else {
        next.delete(filePath)
      }
      return next
    })
  }, [])

  const allFiles = useMemo(() => ({ ...committedFiles, ...addedFiles }), [committedFiles, addedFiles])

  return {
    files: allFiles,
    selectedFile,
    setSelectedFile,
    hasUnsavedChanges,
    unsavedPaths,
    errorPaths,
    updateFileContent,
    getSnapshot,
    getDirtySnapshot,
    getCurrentFileContent,
    resetFileContent,
    hasFileChanges,
    getFileState,
    setFileHasError,
    markAsSaved,
    persistLocal,
    isInitialized,
    deleteFile,
    deletedFiles,
    addFile,
    renameFile,
  }
}
