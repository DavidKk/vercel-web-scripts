import { fileStorageService } from '@/components/ScriptEditor/services/fileStorage'
import { type FileMetadata, FileStatus } from '@/components/ScriptEditor/types'

// Mock fileStorageService
jest.mock('@/components/ScriptEditor/services/fileStorage', () => ({
  fileStorageService: {
    loadFiles: jest.fn(),
    saveFiles: jest.fn(),
    clearFiles: jest.fn(),
  },
}))

// Mock React hooks
const mockUseState = jest.fn()
const mockUseEffect = jest.fn()
const mockUseCallback = jest.fn()
const mockUseRef = jest.fn()

jest.mock('react', () => {
  const actualReact = jest.requireActual('react')
  return {
    ...actualReact,
    useState: (...args: any[]) => mockUseState(...args),
    useEffect: (...args: any[]) => mockUseEffect(...args),
    useCallback: (...args: any[]) => mockUseCallback(...args),
    useRef: (...args: any[]) => mockUseRef(...args),
  }
})

// Mock useFileState hook
const mockFileState = {
  files: {} as Record<string, FileMetadata>,
  getFile: jest.fn(),
  updateFile: jest.fn(),
  markFileAsSaved: jest.fn(),
  getUnsavedFiles: jest.fn(() => []) as jest.MockedFunction<() => string[]>,
  loadStoredFiles: jest.fn(),
}

jest.mock('@/components/ScriptEditor/context/FileStateContext', () => ({
  useFileState: () => mockFileState,
  FileStateProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const mockFileStorageService = fileStorageService as jest.Mocked<typeof fileStorageService>

describe('useFileStorage', () => {
  let useStateReturn: [boolean, jest.Mock]
  let useRefReturn: { current: string }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFileStorageService.loadFiles.mockResolvedValue(null)
    mockFileStorageService.saveFiles.mockResolvedValue()
    mockFileStorageService.clearFiles.mockResolvedValue()

    // Setup useState mock
    useStateReturn = [false, jest.fn()]
    mockUseState.mockReturnValue(useStateReturn)

    // Setup useRef mock
    useRefReturn = { current: 'test-key' }
    mockUseRef.mockReturnValue(useRefReturn)

    // Setup useCallback mock - return the function as-is
    mockUseCallback.mockImplementation((fn: Function) => fn)

    // Setup useEffect mock - execute the effect immediately for testing
    // Note: useEffect can have async effects (functions that return Promise<void>)
    mockUseEffect.mockImplementation((effect: () => void | (() => void) | Promise<void>) => {
      const result = effect()
      // If effect returns a Promise (async function), we don't wait for it here
      // but the test can capture and await it separately
      if (typeof result === 'function') {
        return result
      }
      // If result is a Promise, we don't return it (useEffect doesn't return promises)
      // Tests that need to wait for async effects should capture them separately
    })

    // Reset mock file state
    mockFileState.files = {}
    mockFileState.getFile.mockImplementation((path: string) => mockFileState.files[path])
    mockFileState.updateFile.mockImplementation((path: string, content: string) => {
      if (!mockFileState.files[path]) {
        mockFileState.files[path] = {
          path,
          status: FileStatus.NewUnsaved,
          content: {
            originalContent: '',
            modifiedContent: content,
          },
          updatedAt: Date.now(),
        }
      } else {
        mockFileState.files[path] = {
          ...mockFileState.files[path],
          content: {
            ...mockFileState.files[path].content,
            modifiedContent: content,
          },
          updatedAt: Date.now(),
        }
      }
    })
    mockFileState.markFileAsSaved.mockImplementation((path: string) => {
      if (mockFileState.files[path]) {
        const file = mockFileState.files[path]
        let newStatus = file.status
        if (file.status === FileStatus.ModifiedUnsaved) {
          newStatus = FileStatus.ModifiedSaved
        } else if (file.status === FileStatus.NewUnsaved) {
          newStatus = FileStatus.NewSaved
        }
        mockFileState.files[path] = {
          ...file,
          status: newStatus,
        }
      }
    })
    mockFileState.getUnsavedFiles.mockImplementation(() => {
      return Object.values(mockFileState.files)
        .filter((file) => file.status === FileStatus.ModifiedUnsaved || file.status === FileStatus.NewUnsaved || file.status === FileStatus.Deleted)
        .map((file) => file.path)
    })
  })

  describe('loadFiles', () => {
    it('should load files from IndexedDB using fileStorageService', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      const testFiles: Record<string, FileMetadata> = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content',
            modifiedContent: 'content',
          },
          updatedAt: Date.now(),
        },
      }

      mockFileStorageService.loadFiles.mockResolvedValue(testFiles)

      const hookResult = useFileStorage('test-key')

      const loadedFiles = await hookResult.loadFiles()

      expect(loadedFiles).toEqual(testFiles)
      expect(mockFileStorageService.loadFiles).toHaveBeenCalledWith('test-key')
    })

    it('should return null when load fails', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      mockFileStorageService.loadFiles.mockRejectedValue(new Error('Load failed'))

      const hookResult = useFileStorage('test-key')

      const loadedFiles = await hookResult.loadFiles()

      expect(loadedFiles).toBeNull()
      expect(mockFileStorageService.loadFiles).toHaveBeenCalledWith('test-key')

      consoleSpy.mockRestore()
    })
  })

  describe('saveFiles', () => {
    it('should save files to IndexedDB using fileStorageService', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      const testFiles: Record<string, FileMetadata> = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content',
            modifiedContent: 'content',
          },
          updatedAt: Date.now(),
        },
      }

      const hookResult = useFileStorage('test-key')

      await hookResult.saveFiles(testFiles)

      expect(mockFileStorageService.saveFiles).toHaveBeenCalledWith('test-key', testFiles)
    })

    it('should handle save errors gracefully', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      mockFileStorageService.saveFiles.mockRejectedValue(new Error('Save failed'))

      const hookResult = useFileStorage('test-key')

      const testFiles: Record<string, FileMetadata> = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content',
            modifiedContent: 'content',
          },
          updatedAt: Date.now(),
        },
      }

      await expect(hookResult.saveFiles(testFiles)).resolves.not.toThrow()

      consoleSpy.mockRestore()
    })
  })

  describe('clearFiles', () => {
    it('should clear files from IndexedDB using fileStorageService', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      const hookResult = useFileStorage('test-key')

      await hookResult.clearFiles()

      expect(mockFileStorageService.clearFiles).toHaveBeenCalledWith('test-key')
    })

    it('should handle clear errors gracefully', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      mockFileStorageService.clearFiles.mockRejectedValue(new Error('Clear failed'))

      const hookResult = useFileStorage('test-key')

      await expect(hookResult.clearFiles()).resolves.not.toThrow()

      consoleSpy.mockRestore()
    })
  })

  describe('persist', () => {
    it('should persist current file state to IndexedDB', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      // Set up some files in mock state
      mockFileState.files = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content1',
            modifiedContent: 'content1',
          },
          updatedAt: Date.now(),
        },
      }

      const hookResult = useFileStorage('test-key')

      await hookResult.persist()

      expect(mockFileStorageService.saveFiles).toHaveBeenCalled()
      const callArgs = mockFileStorageService.saveFiles.mock.calls[0]
      expect(callArgs[0]).toBe('test-key')
      expect(callArgs[1]).toBeDefined()
      expect(callArgs[1] && typeof callArgs[1] === 'object' && 'file1.ts' in callArgs[1]).toBe(true)
    })
  })

  describe('saveFile', () => {
    it('should save a specific file and mark it as saved', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      // Set up a file with unsaved changes
      mockFileState.files = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.ModifiedUnsaved,
          content: {
            originalContent: 'original',
            modifiedContent: 'modified',
          },
          updatedAt: Date.now(),
        },
      }

      const hookResult = useFileStorage('test-key')

      jest.clearAllMocks()

      await hookResult.saveFile('file1.ts')

      // Should mark file as saved
      expect(mockFileState.markFileAsSaved).toHaveBeenCalledWith('file1.ts')
      expect(mockFileStorageService.saveFiles).toHaveBeenCalled()
    })

    it('should not save if file does not exist', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      mockFileState.files = {}
      mockFileState.getFile.mockReturnValue(undefined)

      const hookResult = useFileStorage('test-key')

      jest.clearAllMocks()

      await hookResult.saveFile('nonexistent.ts')

      // Should not call saveFiles if file doesn't exist
      expect(mockFileStorageService.saveFiles).not.toHaveBeenCalled()
    })
  })

  describe('saveAllFiles', () => {
    it('should save all unsaved files', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      // Set up files with unsaved changes
      mockFileState.files = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.ModifiedUnsaved,
          content: {
            originalContent: 'original1',
            modifiedContent: 'modified1',
          },
          updatedAt: Date.now(),
        },
        'file2.ts': {
          path: 'file2.ts',
          status: FileStatus.NewUnsaved,
          content: {
            originalContent: '',
            modifiedContent: 'new content',
          },
          updatedAt: Date.now(),
        },
      }

      mockFileState.getUnsavedFiles.mockImplementation(() => ['file1.ts', 'file2.ts'])

      const hookResult = useFileStorage('test-key')

      jest.clearAllMocks()

      await hookResult.saveAllFiles()

      // Should mark all unsaved files as saved
      expect(mockFileState.markFileAsSaved).toHaveBeenCalledWith('file1.ts')
      expect(mockFileState.markFileAsSaved).toHaveBeenCalledWith('file2.ts')
      expect(mockFileStorageService.saveFiles).toHaveBeenCalled()
    })
  })

  describe('storage key handling', () => {
    it('should use the provided storage key', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      const hookResult = useFileStorage('custom-key')

      await hookResult.loadFiles()

      expect(mockFileStorageService.loadFiles).toHaveBeenCalledWith('custom-key')
    })

    it('should update storage key ref when storageKey changes', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      useFileStorage('key1')

      // Check that useRef was called with initial key
      expect(mockUseRef).toHaveBeenCalledWith('key1')

      // Check that useEffect was set up to update ref
      const useEffectCalls = mockUseEffect.mock.calls
      const storageKeyEffect = useEffectCalls.find((call) => {
        const effect = call[0]
        try {
          effect()
          return useRefReturn.current === 'key1'
        } catch {
          return false
        }
      })
      expect(storageKeyEffect).toBeDefined()
    })
  })

  describe('initialization', () => {
    it('should initialize with isInitialized as false', () => {
      const { useFileStorage } = require('@/components/ScriptEditor/hooks/useFileStorage')

      const hookResult = useFileStorage('test-key')

      expect(hookResult.isInitialized).toBe(false)
    })

    it('should load files from IndexedDB on mount', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      const testFiles: Record<string, FileMetadata> = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content',
            modifiedContent: 'content',
          },
          updatedAt: Date.now(),
        },
      }

      mockFileStorageService.loadFiles.mockResolvedValue(testFiles)

      // Mock useEffect to capture the initialization effect
      // The initialization effect is an async function that returns void
      let initPromise: Promise<void> | null = null
      mockUseEffect.mockImplementation((effect: () => void | (() => void) | Promise<void>) => {
        if (typeof effect === 'function') {
          const result = effect()
          // The initialization effect is an async function, so result is a Promise
          if (result instanceof Promise) {
            initPromise = result
          }
        }
      })

      useFileStorage('test-key')

      // Wait for initialization to complete
      if (initPromise) {
        await initPromise
      }

      // Also wait a bit for any setTimeout calls in the initialization
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockFileStorageService.loadFiles).toHaveBeenCalledWith('test-key')
    })

    it('should use loadStoredFiles to restore state when IndexedDB has data', async () => {
      const { useFileStorage } = await import('@/components/ScriptEditor/hooks/useFileStorage')

      const testFiles: Record<string, FileMetadata> = {
        'file1.ts': {
          path: 'file1.ts',
          status: FileStatus.Unchanged,
          content: {
            originalContent: 'content',
            modifiedContent: 'content',
          },
          updatedAt: Date.now(),
        },
      }

      mockFileStorageService.loadFiles.mockResolvedValue(testFiles)

      useFileStorage('test-key')

      // Wait for the async initialize function to complete
      // Since we can't capture the promise directly (React effect), we wait for microtasks
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockFileState.loadStoredFiles).toHaveBeenCalledWith(testFiles)
    })
  })
})
