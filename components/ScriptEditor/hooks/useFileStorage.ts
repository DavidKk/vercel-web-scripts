'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useFileState } from '../context/FileStateContext'
import { fileStorageService } from '../services/fileStorage'
import { type FileMetadata, FileStatus } from '../types'

/**
 * Hook for local file storage management
 * Persists file content and state to IndexedDB
 * IndexedDB data takes priority over initialFiles
 * @param storageKey Unique key for this storage instance
 * @returns Storage management functions
 */
export function useFileStorage(storageKey: string) {
  const fileState = useFileState()
  const [isInitialized, setIsInitialized] = useState(false)
  const storageKeyRef = useRef<string>(storageKey)

  // Update storage key ref when it changes
  useEffect(() => {
    storageKeyRef.current = storageKey
  }, [storageKey])

  /**
   * Load files from IndexedDB
   * @returns Loaded files or null if not found
   */
  const loadFiles = useCallback(async (): Promise<Record<string, FileMetadata> | null> => {
    try {
      return await fileStorageService.loadFiles(storageKey)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[useFileStorage] Failed to load files:', error)
      return null
    }
  }, [storageKey])

  /**
   * Save files to IndexedDB
   * @param files Files to save
   */
  const saveFiles = useCallback(
    async (files: Record<string, FileMetadata>): Promise<void> => {
      try {
        await fileStorageService.saveFiles(storageKey, files)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[useFileStorage] Failed to save files:', error)
      }
    },
    [storageKey]
  )

  /**
   * Clear all files from IndexedDB
   */
  const clearFiles = useCallback(async (): Promise<void> => {
    try {
      await fileStorageService.clearFiles(storageKey)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[useFileStorage] Failed to clear files:', error)
    }
  }, [storageKey])

  /**
   * Persist current file state to IndexedDB
   */
  const persist = useCallback(async (): Promise<void> => {
    await saveFiles(fileState.files)
  }, [fileState.files, saveFiles])

  /**
   * Auto-save: persist files when they change
   */
  useEffect(() => {
    if (!isInitialized) {
      return
    }

    persist()
  }, [fileState.files, isInitialized, persist])

  /**
   * Initialize: load files from IndexedDB on mount
   * IndexedDB data takes priority over initialFiles
   */
  useEffect(() => {
    async function initialize() {
      const loadedFiles = await loadFiles()
      if (loadedFiles && Object.keys(loadedFiles).length > 0) {
        // IndexedDB has data - use it (priority)
        Object.entries(loadedFiles).forEach(([path, file]) => {
          // Restore file content and status from IndexedDB
          fileState.updateFile(path, file.content.modifiedContent)
          // If status was saved, mark it as saved
          if (file.status === FileStatus.ModifiedSaved || file.status === FileStatus.NewSaved) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => {
              fileState.markFileAsSaved(path)
            }, 0)
          }
        })
      } else if (fileState.initialFiles && Object.keys(fileState.initialFiles).length > 0) {
        // IndexedDB has no data - use initialFiles as fallback
        fileState.initializeFiles(fileState.initialFiles)
      }

      setIsInitialized(true)
    }

    initialize()
  }, []) // Only run once on mount - dependencies are intentionally empty

  /**
   * Save file content and state
   * @param path File path
   */
  const saveFile = useCallback(
    async (path: string): Promise<void> => {
      const file = fileState.getFile(path)
      if (file) {
        fileState.markFileAsSaved(path)
        await persist()
      }
    },
    [fileState, persist]
  )

  /**
   * Save all files
   */
  const saveAllFiles = useCallback(async (): Promise<void> => {
    const unsavedFiles = fileState.getUnsavedFiles()
    unsavedFiles.forEach((path) => {
      fileState.markFileAsSaved(path)
    })
    await persist()
  }, [fileState, persist])

  return {
    /** Whether storage is initialized */
    isInitialized,
    /** Load files from IndexedDB */
    loadFiles,
    /** Save files to IndexedDB */
    saveFiles,
    /** Clear all files from IndexedDB */
    clearFiles,
    /** Persist current state to IndexedDB */
    persist,
    /** Save a specific file */
    saveFile,
    /** Save all files */
    saveAllFiles,
  }
}
