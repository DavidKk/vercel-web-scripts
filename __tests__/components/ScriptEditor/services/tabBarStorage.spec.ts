import { indexedDBService } from '@/components/ScriptEditor/services/indexedDBService'
import { TabBarStorageService } from '@/components/ScriptEditor/services/tabBarStorage'

/**
 * Simple in-memory storage for testing
 */
const mockStorage = new Map<string, any>()

/**
 * Global databases map for mock (shared across setup/cleanup)
 */
let mockDatabases: Map<string, { version: number; stores: Map<string, Map<string, any>> }> | null = null

/**
 * Mock IndexedDB implementation for testing
 */
function setupIndexedDBMock() {
  // Create new databases map for each test
  mockDatabases = new Map<string, { version: number; stores: Map<string, Map<string, any>> }>()
  const databases = mockDatabases

  const createRequest = (success: boolean, result?: any, error?: any) => {
    const request = {
      onerror: null as ((event: any) => void) | null,
      onsuccess: null as ((event: any) => void) | null,
      onupgradeneeded: null as ((event: any) => void) | null,
      onblocked: null as ((event: any) => void) | null,
      result,
      error,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }

    // Execute callback asynchronously
    const nextTick = typeof process !== 'undefined' && process.nextTick ? process.nextTick : (fn: () => void) => setTimeout(fn, 0)
    nextTick(() => {
      if (success && request.onsuccess) {
        request.onsuccess({ target: request } as any)
      } else if (!success && request.onerror) {
        request.onerror({ target: request } as any)
      }
    })

    return request
  }

  global.indexedDB = {
    open: jest.fn((name: string, version?: number) => {
      if (!databases.has(name)) {
        databases.set(name, {
          version: version || 1,
          stores: new Map(),
        })
      }

      const dbInfo = databases.get(name)!
      const db = {
        version: dbInfo.version,
        objectStoreNames: {
          contains: (storeName: string) => dbInfo.stores.has(storeName),
        },
        transaction: (storeNames: string[], mode: 'readonly' | 'readwrite' = 'readonly') => {
          void mode
          const storeName = storeNames[0]
          if (!dbInfo.stores.has(storeName)) {
            dbInfo.stores.set(storeName, new Map())
          }
          const store = dbInfo.stores.get(storeName)!

          return {
            objectStore: () => {
              const storeInstance = {
                get: (key: string) => {
                  const value = store.get(key) || null
                  const req = createRequest(true, value)
                  req.result = value
                  return req
                },
                put: (value: any, key: string) => {
                  store.set(key, value)
                  const req = createRequest(true, key)
                  req.result = key
                  return req
                },
                delete: (key: string) => {
                  store.delete(key)
                  const req = createRequest(true)
                  req.result = undefined
                  return req
                },
              }
              return storeInstance
            },
            onerror: null,
            oncomplete: null,
            onabort: null,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
          }
        },
        createObjectStore: (storeName: string) => {
          if (!dbInfo.stores.has(storeName)) {
            dbInfo.stores.set(storeName, new Map())
          }
        },
        close: jest.fn(),
      }

      const request = createRequest(true, db)

      // Trigger onupgradeneeded if version is provided
      if (version && version > (dbInfo.version || 1)) {
        const nextTick = typeof process !== 'undefined' && process.nextTick ? process.nextTick : (fn: () => void) => setTimeout(fn, 0)
        nextTick(() => {
          if (request.onupgradeneeded) {
            request.onupgradeneeded({ target: { result: db } } as any)
          }
        })
      }

      return request as any
    }),
    deleteDatabase: jest.fn((name: string) => {
      databases.delete(name)
      return createRequest(true)
    }),
  } as any

  // Mock window object
  global.window = {
    ...global.window,
    indexedDB: global.indexedDB,
  } as any

  return databases
}

/**
 * Cleanup IndexedDB mock
 */
function cleanupIndexedDBMock() {
  mockStorage.clear()
  // Clear all database stores
  if (mockDatabases) {
    mockDatabases.forEach((dbInfo) => {
      dbInfo.stores.clear()
    })
    mockDatabases.clear()
    mockDatabases = null
  }
  delete (global as any).indexedDB
  if (global.window) {
    delete (global.window as any).indexedDB
  }
}

describe('TabBarStorageService', () => {
  let service: TabBarStorageService
  let originalConsoleError: typeof console.error
  let originalConsoleLog: typeof console.log

  beforeEach(() => {
    // Mock console methods to avoid test output noise
    // eslint-disable-next-line no-console
    originalConsoleError = console.error
    // eslint-disable-next-line no-console
    originalConsoleLog = console.log
    // eslint-disable-next-line no-console
    console.error = jest.fn()
    // eslint-disable-next-line no-console
    console.log = jest.fn()
    setupIndexedDBMock()
    // Reset indexedDBService singleton state
    indexedDBService.closeDB()
    ;(indexedDBService as any).db = null
    ;(indexedDBService as any).isInitializing = false
    ;(indexedDBService as any).initPromise = null
    service = new TabBarStorageService()
  })

  afterEach(async () => {
    // Clean up indexedDBService state
    indexedDBService.closeDB()
    ;(indexedDBService as any).db = null
    ;(indexedDBService as any).isInitializing = false
    ;(indexedDBService as any).initPromise = null
    cleanupIndexedDBMock()
    // Restore console methods
    // eslint-disable-next-line no-console
    console.error = originalConsoleError
    // eslint-disable-next-line no-console
    console.log = originalConsoleLog
  })

  describe('saveTabBarState', () => {
    it('should save tab bar state to IndexedDB', async () => {
      const openTabs = ['file1.ts', 'file2.ts', 'file3.ts']
      const activeTab = 'file2.ts'

      await service.saveTabBarState(openTabs, activeTab)

      const loadedState = await service.loadTabBarState()
      expect(loadedState).not.toBeNull()
      expect(loadedState?.openTabs).toEqual(openTabs)
      expect(loadedState?.activeTab).toBe(activeTab)
    })

    it('should save empty tabs array', async () => {
      const openTabs: string[] = []
      const activeTab = null

      await service.saveTabBarState(openTabs, activeTab)

      const loadedState = await service.loadTabBarState()
      expect(loadedState).not.toBeNull()
      expect(loadedState?.openTabs).toEqual([])
      expect(loadedState?.activeTab).toBeNull()
    })

    it('should save null active tab', async () => {
      const openTabs = ['file1.ts']
      const activeTab = null

      await service.saveTabBarState(openTabs, activeTab)

      const loadedState = await service.loadTabBarState()
      expect(loadedState).not.toBeNull()
      expect(loadedState?.openTabs).toEqual(openTabs)
      expect(loadedState?.activeTab).toBeNull()
    })

    it('should update existing state', async () => {
      // Save initial state
      await service.saveTabBarState(['file1.ts'], 'file1.ts')

      // Update state
      await service.saveTabBarState(['file2.ts', 'file3.ts'], 'file3.ts')

      const loadedState = await service.loadTabBarState()
      expect(loadedState?.openTabs).toEqual(['file2.ts', 'file3.ts'])
      expect(loadedState?.activeTab).toBe('file3.ts')
    })

    it('should handle save errors gracefully', async () => {
      // Mock a database error
      const originalOpen = global.indexedDB.open
      global.indexedDB.open = jest.fn(() => {
        const request = {
          onerror: null as ((event: any) => void) | null,
          onsuccess: null as ((event: any) => void) | null,
          error: new Error('Database error'),
        }
        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: request } as any)
          }
        }, 0)
        return request as any
      })

      // Should not throw
      await expect(service.saveTabBarState(['file1.ts'], 'file1.ts')).resolves.not.toThrow()

      global.indexedDB.open = originalOpen
    })
  })

  describe('loadTabBarState', () => {
    it('should return null when no state exists', async () => {
      // Ensure no state exists by clearing first
      await service.clearTabBarState()
      const loadedState = await service.loadTabBarState()
      expect(loadedState).toBeNull()
    })

    it('should load tab bar state from IndexedDB', async () => {
      const openTabs = ['file1.ts', 'file2.ts']
      const activeTab = 'file1.ts'

      await service.saveTabBarState(openTabs, activeTab)
      const loadedState = await service.loadTabBarState()

      expect(loadedState).not.toBeNull()
      expect(loadedState?.openTabs).toEqual(openTabs)
      expect(loadedState?.activeTab).toBe(activeTab)
    })

    it('should load state with empty tabs', async () => {
      await service.saveTabBarState([], null)
      const loadedState = await service.loadTabBarState()

      expect(loadedState).not.toBeNull()
      expect(loadedState?.openTabs).toEqual([])
      expect(loadedState?.activeTab).toBeNull()
    })

    it('should handle load errors gracefully', async () => {
      // Close existing connection first
      indexedDBService.closeDB()
      ;(indexedDBService as any).db = null
      ;(indexedDBService as any).isInitializing = false
      ;(indexedDBService as any).initPromise = null

      // Mock a database error
      const originalOpen = global.indexedDB.open
      global.indexedDB.open = jest.fn(() => {
        const request = {
          onerror: null as ((event: any) => void) | null,
          onsuccess: null as ((event: any) => void) | null,
          onupgradeneeded: null as ((event: any) => void) | null,
          onblocked: null as ((event: any) => void) | null,
          error: new Error('Database error'),
          result: undefined,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        }
        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: request } as any)
          }
        }, 0)
        return request as any
      })

      const loadedState = await service.loadTabBarState()
      expect(loadedState).toBeNull()

      global.indexedDB.open = originalOpen
    })
  })

  describe('clearTabBarState', () => {
    it('should clear tab bar state from IndexedDB', async () => {
      // Save state first
      await service.saveTabBarState(['file1.ts', 'file2.ts'], 'file1.ts')

      // Verify it exists
      let loadedState = await service.loadTabBarState()
      expect(loadedState).not.toBeNull()

      // Clear state
      await service.clearTabBarState()

      // Verify it's cleared
      loadedState = await service.loadTabBarState()
      expect(loadedState).toBeNull()
    })

    it('should handle clear errors gracefully', async () => {
      // Mock a database error
      const originalOpen = global.indexedDB.open
      global.indexedDB.open = jest.fn(() => {
        const request = {
          onerror: null as ((event: any) => void) | null,
          onsuccess: null as ((event: any) => void) | null,
          error: new Error('Database error'),
        }
        setTimeout(() => {
          if (request.onerror) {
            request.onerror({ target: request } as any)
          }
        }, 0)
        return request as any
      })

      // Should not throw
      await expect(service.clearTabBarState()).resolves.not.toThrow()

      global.indexedDB.open = originalOpen
    })
  })

  describe('State persistence', () => {
    it('should persist and restore complete state', async () => {
      const openTabs = ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts']
      const activeTab = 'file3.ts'

      // Save state
      await service.saveTabBarState(openTabs, activeTab)

      // Create new service instance to simulate page reload
      const newService = new TabBarStorageService()
      ;(newService as any).db = null

      // Load state
      const loadedState = await newService.loadTabBarState()

      expect(loadedState).not.toBeNull()
      expect(loadedState?.openTabs).toEqual(openTabs)
      expect(loadedState?.activeTab).toBe(activeTab)
    })

    it('should handle state with many tabs', async () => {
      const openTabs = Array.from({ length: 20 }, (_, i) => `file${i + 1}.ts`)
      const activeTab = 'file10.ts'

      await service.saveTabBarState(openTabs, activeTab)
      const loadedState = await service.loadTabBarState()

      expect(loadedState?.openTabs).toHaveLength(20)
      expect(loadedState?.openTabs).toEqual(openTabs)
      expect(loadedState?.activeTab).toBe(activeTab)
    })

    it('should preserve tab order', async () => {
      const openTabs = ['file3.ts', 'file1.ts', 'file2.ts']
      const activeTab = 'file1.ts'

      await service.saveTabBarState(openTabs, activeTab)
      const loadedState = await service.loadTabBarState()

      expect(loadedState?.openTabs).toEqual(openTabs)
    })
  })

  describe('Database initialization', () => {
    it('should create object store if it does not exist', async () => {
      // Service should handle missing object store
      await service.saveTabBarState(['file1.ts'], 'file1.ts')

      const loadedState = await service.loadTabBarState()
      expect(loadedState).not.toBeNull()
    })

    it('should handle multiple save/load operations', async () => {
      // Multiple saves
      await service.saveTabBarState(['file1.ts'], 'file1.ts')
      await service.saveTabBarState(['file1.ts', 'file2.ts'], 'file2.ts')
      await service.saveTabBarState(['file2.ts', 'file3.ts'], 'file3.ts')

      const loadedState = await service.loadTabBarState()
      expect(loadedState?.openTabs).toEqual(['file2.ts', 'file3.ts'])
      expect(loadedState?.activeTab).toBe('file3.ts')
    })
  })
})
