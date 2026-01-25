'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import { type FileContent, type FileMetadata, type FileStateRecord, FileStatus } from '../types'

/**
 * File state context value
 */
export interface FileStateContextValue {
  /** All file states */
  files: FileStateRecord
  /** Initial files (used as fallback when IndexedDB has no data) */
  initialFiles: Record<string, string>
  /** Get file metadata by path */
  getFile: (path: string) => FileMetadata | undefined
  /** Get file content by path */
  getFileContent: (path: string) => FileContent | undefined
  /** Get file status by path */
  getFileStatus: (path: string) => FileStatus | undefined
  /** Update file content */
  updateFile: (path: string, content: string) => void
  /** Create new file */
  createFile: (path: string, content?: string) => void
  /** Delete file */
  deleteFile: (path: string) => void
  /** Rename file */
  renameFile: (oldPath: string, newPath: string) => void
  /** Reset file to original content */
  resetFile: (path: string) => void
  /** Mark file as saved */
  markFileAsSaved: (path: string) => void
  /** Check if file has unsaved changes */
  hasUnsavedChanges: (path: string) => boolean
  /** Check if there are any unsaved changes */
  hasAnyUnsavedChanges: () => boolean
  /** Get all files with unsaved changes */
  getUnsavedFiles: () => string[]
  /** Initialize files from initialFiles (used when IndexedDB has no data) */
  initializeFiles: (files: Record<string, string>) => void
  /** Load files from storage (Atomic restoration of full metadata) */
  loadStoredFiles: (files: FileStateRecord) => void
}

/**
 * File state context
 */
const FileStateContext = createContext<FileStateContextValue | null>(null)

/**
 * File state provider props
 */
export interface FileStateProviderProps {
  /** Initial files (used only if IndexedDB has no data) */
  initialFiles?: Record<string, string>
  /** Children */
  children: React.ReactNode
}

/**
 * File state provider component
 * Manages file states including unchanged, modified, new, and deleted files
 * Note: IndexedDB data takes priority over initialFiles
 * @param props Component props
 * @returns Provider component
 */
export function FileStateProvider({ initialFiles = {}, children }: FileStateProviderProps) {
  // Start with empty state - will be populated by useFileStorage from IndexedDB first
  const [files, setFiles] = useState<FileStateRecord>({})

  /**
   * Initialize files from initialFiles (called when IndexedDB has no data)
   * @param filesToInit Files to initialize
   */
  const initializeFiles = useCallback((filesToInit: Record<string, string>) => {
    setFiles((prev) => {
      // Only initialize if current state is empty
      if (Object.keys(prev).length === 0) {
        const initial: FileStateRecord = {}
        Object.entries(filesToInit).forEach(([path, content]) => {
          initial[path] = {
            path,
            status: FileStatus.Unchanged,
            content: {
              originalContent: content,
              modifiedContent: content,
            },
            updatedAt: Date.now(),
          }
        })
        return initial
      }
      return prev
    })
  }, [])

  /**
   * Get file metadata by path
   * @param path File path
   * @returns File metadata or undefined
   */
  const getFile = useCallback(
    (path: string): FileMetadata | undefined => {
      return files[path]
    },
    [files]
  )

  /**
   * Get file content by path
   * @param path File path
   * @returns File content or undefined
   */
  const getFileContent = useCallback(
    (path: string): FileContent | undefined => {
      return files[path]?.content
    },
    [files]
  )

  /**
   * Get file status by path
   * @param path File path
   * @returns File status or undefined
   */
  const getFileStatus = useCallback(
    (path: string): FileStatus | undefined => {
      return files[path]?.status
    },
    [files]
  )

  /**
   * Update file content
   * @param path File path
   * @param content New content
   */
  const updateFile = useCallback((path: string, content: string) => {
    setFiles((prev) => {
      const file = prev[path]
      if (!file) {
        // If file doesn't exist, create it as new-unsaved
        return {
          ...prev,
          [path]: {
            path,
            status: FileStatus.NewUnsaved,
            content: {
              originalContent: '',
              modifiedContent: content,
            },
            updatedAt: Date.now(),
          },
        }
      }

      // Update existing file
      const newContent = {
        originalContent: file.content.originalContent,
        modifiedContent: content,
      }

      // Determine new status
      let newStatus: FileStatus = file.status

      if (file.status === FileStatus.Deleted) {
        // If file was deleted, restore it
        newStatus = file.content.originalContent ? FileStatus.ModifiedUnsaved : FileStatus.NewUnsaved
      } else if (file.status === FileStatus.Unchanged) {
        // If unchanged, mark as modified-unsaved
        newStatus = content !== file.content.originalContent ? FileStatus.ModifiedUnsaved : FileStatus.Unchanged
      } else if (file.status === FileStatus.ModifiedSaved) {
        // If was saved but content changed, mark as modified-unsaved
        newStatus = content !== file.content.modifiedContent ? FileStatus.ModifiedUnsaved : FileStatus.ModifiedSaved
      } else if (file.status === FileStatus.NewSaved) {
        // If was new-saved but content changed, mark as new-unsaved
        newStatus = content !== file.content.modifiedContent ? FileStatus.NewUnsaved : FileStatus.NewSaved
      } else if (file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved) {
        // If already unsaved, check if content matches original
        if (file.status === FileStatus.ModifiedUnsaved && content === file.content.originalContent) {
          newStatus = FileStatus.Unchanged
        } else if (file.status === FileStatus.NewUnsaved && !file.content.originalContent && !content) {
          newStatus = FileStatus.Unchanged
        }
        // Otherwise keep current status
      }

      return {
        ...prev,
        [path]: {
          ...file,
          content: newContent,
          status: newStatus,
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  /**
   * Create new file
   * If file already exists and is not deleted, do nothing
   * If file is deleted, replace it with new file
   * @param path File path
   * @param content Initial content
   */
  const createFile = useCallback((path: string, content = '') => {
    setFiles((prev) => {
      const existingFile = prev[path]

      // If file exists and is not deleted, do nothing
      if (existingFile && existingFile.status !== FileStatus.Deleted) {
        return prev
      }

      // If file is deleted or doesn't exist, create new file
      return {
        ...prev,
        [path]: {
          path,
          status: FileStatus.NewUnsaved,
          content: {
            originalContent: '',
            modifiedContent: content,
          },
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  /**
   * Delete file
   * @param path File path
   */
  const deleteFile = useCallback((path: string) => {
    setFiles((prev) => {
      const file = prev[path]
      if (!file) {
        return prev
      }

      // If it's a new file, remove it completely
      if (file.status === FileStatus.NewUnsaved || file.status === FileStatus.NewSaved) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [path]: _, ...rest } = prev
        return rest
      }

      // Otherwise mark as deleted
      return {
        ...prev,
        [path]: {
          ...file,
          status: FileStatus.Deleted,
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  /**
   * Rename file
   * Preserves file status and content when renaming
   * @param oldPath Old file path
   * @param newPath New file path
   */
  const renameFile = useCallback((oldPath: string, newPath: string) => {
    setFiles((prev) => {
      const file = prev[oldPath]
      if (!file) {
        return prev
      }

      // If new path already exists, don't rename
      if (prev[newPath]) {
        return prev
      }

      // Remove old file and create new one with same status and content
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [oldPath]: _, ...rest } = prev

      return {
        ...rest,
        [newPath]: {
          ...file,
          path: newPath,
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  /**
   * Reset file to original content
   * @param path File path
   */
  const resetFile = useCallback((path: string) => {
    setFiles((prev) => {
      const file = prev[path]
      if (!file) {
        return prev
      }

      // If it's a new file, remove it
      if (file.status === FileStatus.NewUnsaved || file.status === FileStatus.NewSaved) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [path]: _, ...rest } = prev
        return rest
      }

      // Reset to original content
      return {
        ...prev,
        [path]: {
          ...file,
          status: FileStatus.Unchanged,
          content: {
            originalContent: file.content.originalContent,
            modifiedContent: file.content.originalContent,
          },
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  /**
   * Mark file as saved
   * @param path File path
   */
  const markFileAsSaved = useCallback((path: string) => {
    setFiles((prev) => {
      const file = prev[path]
      if (!file) {
        return prev
      }

      let newStatus: FileStatus = file.status

      if (file.status === FileStatus.ModifiedUnsaved) {
        newStatus = FileStatus.ModifiedSaved
      } else if (file.status === FileStatus.NewUnsaved) {
        newStatus = FileStatus.NewSaved
      } else if (file.status === FileStatus.Deleted) {
        // If deleted file is saved, remove it
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [path]: _, ...rest } = prev
        return rest
      }

      // Update original content to match modified content after save
      return {
        ...prev,
        [path]: {
          ...file,
          status: newStatus,
          content: {
            originalContent: file.content.modifiedContent,
            modifiedContent: file.content.modifiedContent,
          },
          updatedAt: Date.now(),
        },
      }
    })
  }, [])

  /**
   * Check if file has unsaved changes
   * @param path File path
   * @returns True if file has unsaved changes
   */
  const hasUnsavedChanges = useCallback(
    (path: string): boolean => {
      const file = files[path]
      if (!file) {
        return false
      }
      return file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted
    },
    [files]
  )

  /**
   * Check if there are any unsaved changes
   * @returns True if there are any unsaved changes
   */
  const hasAnyUnsavedChanges = useCallback((): boolean => {
    return Object.values(files).some((file) => file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted)
  }, [files])

  /**
   * Get all files with unsaved changes
   * @returns Array of file paths with unsaved changes
   */
  const getUnsavedFiles = useCallback((): string[] => {
    return Object.values(files)
      .filter((file) => file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted)
      .map((file) => file.path)
  }, [files])

  /**
   * Load files from storage (Atomic restoration of full metadata)
   * @param storedFiles Files to load from storage
   */
  const loadStoredFiles = useCallback((storedFiles: FileStateRecord) => {
    setFiles(storedFiles)
  }, [])

  const value = useMemo<FileStateContextValue>(
    () => ({
      files,
      initialFiles,
      getFile,
      getFileContent,
      getFileStatus,
      updateFile,
      createFile,
      deleteFile,
      renameFile,
      resetFile,
      markFileAsSaved,
      hasUnsavedChanges,
      hasAnyUnsavedChanges,
      getUnsavedFiles,
      initializeFiles,
      loadStoredFiles,
    }),
    [
      files,
      initialFiles,
      getFile,
      getFileContent,
      getFileStatus,
      updateFile,
      createFile,
      deleteFile,
      renameFile,
      resetFile,
      markFileAsSaved,
      hasUnsavedChanges,
      hasAnyUnsavedChanges,
      getUnsavedFiles,
      initializeFiles,
      loadStoredFiles,
    ]
  )

  return <FileStateContext.Provider value={value}>{children}</FileStateContext.Provider>
}

/**
 * Hook to use file state context
 * @returns File state context value
 * @throws Error if used outside FileStateProvider
 */
export function useFileState(): FileStateContextValue {
  const context = useContext(FileStateContext)
  if (!context) {
    throw new Error('useFileState must be used within FileStateProvider')
  }
  return context
}
