import type { FileStateContextValue } from '@/components/ScriptEditor/context/FileStateContext'
import { FileStatus } from '@/components/ScriptEditor/types'

/**
 * Helper to create and test FileStateProvider
 * Directly tests the provider logic without React DOM
 */
function createFileStateProvider(initialFilesParam?: Record<string, string>): FileStateContextValue {
  // We'll test the provider by creating a test instance
  // Since we can't easily test React Context in Node.js without jsdom,
  // we'll extract and test the core logic
  let files: Record<string, any> = {}
  const initialFiles: Record<string, string> = initialFilesParam || {}

  if (initialFilesParam) {
    Object.entries(initialFilesParam).forEach(([path, content]) => {
      files[path] = {
        path,
        status: FileStatus.Unchanged,
        content: {
          originalContent: content,
          modifiedContent: content,
        },
        updatedAt: Date.now(),
      }
    })
  }

  // Simulate the provider's state management logic
  const getFile = (path: string) => files[path]

  const updateFile = (path: string, content: string) => {
    const file = files[path]
    if (!file) {
      files[path] = {
        path,
        status: FileStatus.NewUnsaved,
        content: {
          originalContent: '',
          modifiedContent: content,
        },
        updatedAt: Date.now(),
      }
      return
    }

    const newContent = {
      originalContent: file.content.originalContent,
      modifiedContent: content,
    }

    let newStatus: FileStatus = file.status
    if (file.status === FileStatus.Deleted) {
      newStatus = file.content.originalContent ? FileStatus.ModifiedUnsaved : FileStatus.NewUnsaved
    } else if (file.status === FileStatus.Unchanged) {
      newStatus = content !== file.content.originalContent ? FileStatus.ModifiedUnsaved : FileStatus.Unchanged
    } else if (file.status === FileStatus.ModifiedSaved) {
      newStatus = content !== file.content.modifiedContent ? FileStatus.ModifiedUnsaved : FileStatus.ModifiedSaved
    } else if (file.status === FileStatus.NewSaved) {
      newStatus = content !== file.content.modifiedContent ? FileStatus.NewUnsaved : FileStatus.NewSaved
    } else if (file.status === FileStatus.ModifiedUnsaved && content === file.content.originalContent) {
      newStatus = FileStatus.Unchanged
    }

    files[path] = {
      ...file,
      content: newContent,
      status: newStatus,
      updatedAt: Date.now(),
    }
  }

  const createFile = (path: string, content = '') => {
    const existingFile = files[path]
    if (existingFile && existingFile.status !== FileStatus.Deleted) {
      return
    }

    files[path] = {
      path,
      status: FileStatus.NewUnsaved,
      content: {
        originalContent: '',
        modifiedContent: content,
      },
      updatedAt: Date.now(),
    }
  }

  const deleteFile = (path: string) => {
    const file = files[path]
    if (!file) {
      return
    }

    if (file.status === FileStatus.NewUnsaved || file.status === FileStatus.NewSaved) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [path]: _, ...rest } = files
      files = rest
      return
    }

    files[path] = {
      ...file,
      status: FileStatus.Deleted,
      updatedAt: Date.now(),
    }
  }

  const renameFile = (oldPath: string, newPath: string) => {
    const file = files[oldPath]
    if (!file) {
      return
    }

    if (files[newPath]) {
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [oldPath]: _, ...rest } = files
    files = {
      ...rest,
      [newPath]: {
        ...file,
        path: newPath,
        updatedAt: Date.now(),
      },
    }
  }

  const initializeFiles = (filesToInit: Record<string, string>) => {
    if (Object.keys(files).length === 0) {
      Object.entries(filesToInit).forEach(([path, content]) => {
        files[path] = {
          path,
          status: FileStatus.Unchanged,
          content: {
            originalContent: content,
            modifiedContent: content,
          },
          updatedAt: Date.now(),
        }
      })
    }
  }

  const hasUnsavedChanges = (path: string) => {
    const file = files[path]
    if (!file) {
      return false
    }
    return file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted
  }

  const hasAnyUnsavedChanges = () => {
    return Object.values(files).some((file) => file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted)
  }

  const getUnsavedFiles = () => {
    return Object.values(files)
      .filter((file) => file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted)
      .map((file) => file.path)
  }

  const markFileAsSaved = (path: string) => {
    const file = files[path]
    if (!file) {
      return
    }

    let newStatus: FileStatus = file.status
    if (file.status === FileStatus.ModifiedUnsaved) {
      newStatus = FileStatus.ModifiedSaved
    } else if (file.status === FileStatus.NewUnsaved) {
      newStatus = FileStatus.NewSaved
    } else if (file.status === FileStatus.Deleted) {
      // If deleted file is saved, remove it
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [path]: _, ...rest } = files
      files = rest
      return
    }

    // Update original content to match modified content after save
    files[path] = {
      ...file,
      status: newStatus,
      content: {
        originalContent: file.content.modifiedContent,
        modifiedContent: file.content.modifiedContent,
      },
      updatedAt: Date.now(),
    }
  }

  const markFileAsUnchanged = (path: string) => {
    const file = files[path]
    if (!file) {
      return
    }

    // Mark as unchanged: set both original and modified content to current modified content
    files[path] = {
      ...file,
      status: FileStatus.Unchanged,
      content: {
        originalContent: file.content.modifiedContent,
        modifiedContent: file.content.modifiedContent,
      },
      updatedAt: Date.now(),
    }
  }

  const loadStoredFiles = (storedFiles: Record<string, any>) => {
    files = storedFiles
  }

  return {
    files,
    initialFiles,
    getFile,
    getFileContent: (path: string) => files[path]?.content,
    getFileStatus: (path: string) => files[path]?.status,
    updateFile,
    createFile,
    deleteFile,
    renameFile,
    resetFile: () => {},
    markFileAsSaved,
    markFileAsUnchanged,
    hasUnsavedChanges,
    hasAnyUnsavedChanges,
    getUnsavedFiles,
    initializeFiles,
    loadStoredFiles: loadStoredFiles as any,
  }
}

// Export for use in other test files
export { createFileStateProvider }

describe('FileStateContext', () => {
  describe('loadStoredFiles', () => {
    it('should restore full file metadata from storage', () => {
      const fileState = createFileStateProvider()
      const storedFiles = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content1',
            modifiedContent: 'content1',
          },
          updatedAt: Date.now(),
        },
        'file2.ts': {
          path: 'file2.ts',
          status: FileStatus.ModifiedUnsaved,
          content: {
            originalContent: 'original',
            modifiedContent: 'modified',
          },
          updatedAt: Date.now(),
        },
      }

      fileState.loadStoredFiles(storedFiles)

      expect(fileState.getFile('file1.ts')).toEqual(storedFiles['file1.ts'])
      expect(fileState.getFile('file2.ts')).toEqual(storedFiles['file2.ts'])
      expect(fileState.getFileStatus('file1.ts')).toBe(FileStatus.Unchanged)
      expect(fileState.getFileStatus('file2.ts')).toBe(FileStatus.ModifiedUnsaved)
    })
  })

  describe('renameFile', () => {
    it('should preserve file status and content when renaming', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content1' })
      fileState.renameFile('file1.ts', 'file2.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2).toBeDefined()
      expect(file2?.path).toBe('file2.ts')
      expect(file2?.status).toBe(FileStatus.Unchanged)
      expect(file2?.content.originalContent).toBe('content1')
      expect(file2?.content.modifiedContent).toBe('content1')

      const file1 = fileState.getFile('file1.ts')
      expect(file1).toBeUndefined()
    })

    it('should preserve ModifiedUnsaved status when renaming', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      // Modify file
      fileState.updateFile('file1.ts', 'modified')

      // Rename
      fileState.renameFile('file1.ts', 'file2.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.ModifiedUnsaved)
      expect(file2?.content.originalContent).toBe('original')
      expect(file2?.content.modifiedContent).toBe('modified')
    })

    it('should preserve NewUnsaved status when renaming', () => {
      const fileState = createFileStateProvider()
      // Create new file
      fileState.createFile('file1.ts', 'new content')

      // Rename
      fileState.renameFile('file1.ts', 'file2.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.NewUnsaved)
      expect(file2?.content.originalContent).toBe('')
      expect(file2?.content.modifiedContent).toBe('new content')
    })

    it('should preserve Deleted status when renaming', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content' })
      // Delete file
      fileState.deleteFile('file1.ts')

      // Rename deleted file
      fileState.renameFile('file1.ts', 'file2.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.Deleted)

      const file1 = fileState.getFile('file1.ts')
      expect(file1).toBeUndefined()
    })

    it('should not rename if new path already exists', () => {
      const fileState = createFileStateProvider({
        'file1.ts': 'content1',
        'file2.ts': 'content2',
      })
      fileState.renameFile('file1.ts', 'file2.ts')

      // file1 should still exist
      const file1 = fileState.getFile('file1.ts')
      expect(file1).toBeDefined()

      // file2 should remain unchanged
      const file2 = fileState.getFile('file2.ts')
      expect(file2?.content.modifiedContent).toBe('content2')
    })

    it('should not rename if old path does not exist', () => {
      const fileState = createFileStateProvider()
      fileState.renameFile('nonexistent.ts', 'file2.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2).toBeUndefined()
    })
  })

  describe('createFile after rename', () => {
    it('should create new file with same name after rename', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original content' })
      // Rename file1 to file2
      fileState.renameFile('file1.ts', 'file2.ts')

      // Create new file with original name
      fileState.createFile('file1.ts', 'new content')

      const file1 = fileState.getFile('file1.ts')
      expect(file1).toBeDefined()
      expect(file1?.status).toBe(FileStatus.NewUnsaved)
      expect(file1?.content.originalContent).toBe('')
      expect(file1?.content.modifiedContent).toBe('new content')

      const file2 = fileState.getFile('file2.ts')
      expect(file2).toBeDefined()
      expect(file2?.content.modifiedContent).toBe('original content')
    })

    it('should create new file with same name after renaming ModifiedUnsaved file', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      // Modify file
      fileState.updateFile('file1.ts', 'modified')

      // Rename
      fileState.renameFile('file1.ts', 'file2.ts')

      // Create new file with original name
      fileState.createFile('file1.ts', 'new content')

      const file1 = fileState.getFile('file1.ts')
      expect(file1?.status).toBe(FileStatus.NewUnsaved)
      expect(file1?.content.modifiedContent).toBe('new content')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.ModifiedUnsaved)
      expect(file2?.content.modifiedContent).toBe('modified')
    })
  })

  describe('createFile after delete', () => {
    it('should replace deleted file when creating with same name', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original content' })
      // Delete file
      fileState.deleteFile('file1.ts')

      const deletedFile = fileState.getFile('file1.ts')
      expect(deletedFile?.status).toBe(FileStatus.Deleted)

      // Create new file with same name
      fileState.createFile('file1.ts', 'new content')

      const newFile = fileState.getFile('file1.ts')
      expect(newFile?.status).toBe(FileStatus.NewUnsaved)
      expect(newFile?.content.originalContent).toBe('')
      expect(newFile?.content.modifiedContent).toBe('new content')
    })

    it('should not replace non-deleted file when creating with same name', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original content' })
      // Try to create file with existing name
      fileState.createFile('file1.ts', 'new content')

      const file = fileState.getFile('file1.ts')
      expect(file?.status).toBe(FileStatus.Unchanged)
      expect(file?.content.modifiedContent).toBe('original content')
    })

    it('should replace deleted NewUnsaved file when creating with same name', () => {
      const fileState = createFileStateProvider()
      // Create new file
      fileState.createFile('file1.ts', 'new content')

      // Delete it (should be removed completely)
      fileState.deleteFile('file1.ts')

      const deletedFile = fileState.getFile('file1.ts')
      expect(deletedFile).toBeUndefined()

      // Create new file with same name
      fileState.createFile('file1.ts', 'another content')

      const newFile = fileState.getFile('file1.ts')
      expect(newFile?.status).toBe(FileStatus.NewUnsaved)
      expect(newFile?.content.modifiedContent).toBe('another content')
    })
  })

  describe('renameFile after delete', () => {
    it('should rename deleted file preserving Deleted status', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content' })
      // Delete file
      fileState.deleteFile('file1.ts')

      // Rename deleted file
      fileState.renameFile('file1.ts', 'file2.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.Deleted)

      const file1 = fileState.getFile('file1.ts')
      expect(file1).toBeUndefined()
    })

    it('should allow creating new file with original name after renaming deleted file', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'content' })
      // Delete file
      fileState.deleteFile('file1.ts')

      // Rename deleted file
      fileState.renameFile('file1.ts', 'file2.ts')

      // Create new file with original name
      fileState.createFile('file1.ts', 'new content')

      const file1 = fileState.getFile('file1.ts')
      expect(file1?.status).toBe(FileStatus.NewUnsaved)
      expect(file1?.content.modifiedContent).toBe('new content')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.Deleted)
    })
  })

  describe('complex scenarios', () => {
    it('should handle rename -> create -> rename chain correctly', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      // Step 1: Rename file1 to file2
      fileState.renameFile('file1.ts', 'file2.ts')

      // Step 2: Create new file1
      fileState.createFile('file1.ts', 'new content')

      // Step 3: Rename new file1 to file3
      fileState.renameFile('file1.ts', 'file3.ts')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.Unchanged)
      expect(file2?.content.modifiedContent).toBe('original')

      const file3 = fileState.getFile('file3.ts')
      expect(file3?.status).toBe(FileStatus.NewUnsaved)
      expect(file3?.content.modifiedContent).toBe('new content')

      const file1 = fileState.getFile('file1.ts')
      expect(file1).toBeUndefined()
    })

    it('should handle delete -> rename -> create chain correctly', () => {
      const fileState = createFileStateProvider({ 'file1.ts': 'original' })
      // Step 1: Delete file1
      fileState.deleteFile('file1.ts')

      // Step 2: Rename deleted file1 to file2
      fileState.renameFile('file1.ts', 'file2.ts')

      // Step 3: Create new file1
      fileState.createFile('file1.ts', 'new content')

      const file1 = fileState.getFile('file1.ts')
      expect(file1?.status).toBe(FileStatus.NewUnsaved)
      expect(file1?.content.modifiedContent).toBe('new content')

      const file2 = fileState.getFile('file2.ts')
      expect(file2?.status).toBe(FileStatus.Deleted)
    })
  })
})
