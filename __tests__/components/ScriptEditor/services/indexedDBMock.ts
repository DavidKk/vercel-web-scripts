/**
 * Mock Blob for testing
 */
class MockBlob {
  constructor(
    public parts: any[],
    public options?: any
  ) {}
  get _text() {
    return this.parts.join('')
  }
}

/**
 * Global databases map for mock (shared across setup/cleanup)
 */
let mockDatabases: Map<string, { version: number; stores: Map<string, Map<string, any>> }> | null = null

/**
 * Mock IndexedDB implementation for testing
 */
export function setupIndexedDBMock() {
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
      readyState: 'pending' as 'pending' | 'done',
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }

    const trigger = () => {
      request.readyState = 'done'
      if (success && request.onsuccess) {
        request.onsuccess({ target: request } as any)
      } else if (!success && request.onerror) {
        request.onerror({ target: request } as any)
      }
    }

    // Use a small delay to simulate async behavior
    setTimeout(trigger, 0)

    return request
  }

  const mockObjectStore = (dbInfo: { stores: Map<string, Map<string, any>> }, storeName: string) => {
    if (!dbInfo.stores.has(storeName)) {
      dbInfo.stores.set(storeName, new Map())
    }
    const store = dbInfo.stores.get(storeName)!

    const serializeKey = (key: any): string => {
      if (Array.isArray(key)) return JSON.stringify(key)
      return String(key)
    }

    return {
      name: storeName,
      keyPath: ['storageKey', 'path'],
      indexNames: { contains: jest.fn(() => true) },
      get: jest.fn((key: any) => {
        const serializedKey = serializeKey(key)
        const value = store.get(serializedKey) || null
        return createRequest(true, value)
      }),
      put: jest.fn((value: any, key?: any) => {
        const actualKey = key || (value.storageKey && value.path ? [value.storageKey, value.path] : null)
        if (!actualKey) throw new Error('Key is required')
        const serializedKey = serializeKey(actualKey)
        store.set(serializedKey, value)
        return createRequest(true, actualKey)
      }),
      delete: jest.fn((key: any) => {
        const serializedKey = serializeKey(key)
        store.delete(serializedKey)
        return createRequest(true)
      }),
      createIndex: jest.fn(() => ({})),
      index: jest.fn((indexName: string) => ({
        getAll: jest.fn((queryValue: any) => {
          const results: any[] = []
          store.forEach((value) => {
            if (typeof value === 'object' && value !== null) {
              if (indexName === 'storageKey' && value.storageKey === queryValue) {
                results.push(value)
              } else if (indexName === 'path' && value.path === queryValue) {
                results.push(value)
              }
            }
          })
          return createRequest(true, results)
        }),
        getAllKeys: jest.fn((queryValue: any) => {
          const results: any[] = []
          store.forEach((value, serializedKey) => {
            if (typeof value === 'object' && value !== null) {
              if (indexName === 'storageKey' && value.storageKey === queryValue) {
                // For composite keys [storageKey, path], always return array
                try {
                  const parsed = JSON.parse(serializedKey)
                  // Ensure it's an array (composite key)
                  if (Array.isArray(parsed)) {
                    results.push(parsed)
                  } else {
                    // If not array, construct composite key from value
                    results.push([value.storageKey, value.path])
                  }
                } catch {
                  // If parsing fails, construct composite key from value
                  results.push([value.storageKey, value.path])
                }
              } else if (indexName === 'path' && value.path === queryValue) {
                // For composite keys [storageKey, path], always return array
                try {
                  const parsed = JSON.parse(serializedKey)
                  // Ensure it's an array (composite key)
                  if (Array.isArray(parsed)) {
                    results.push(parsed)
                  } else {
                    // If not array, construct composite key from value
                    results.push([value.storageKey, value.path])
                  }
                } catch {
                  // If parsing fails, construct composite key from value
                  results.push([value.storageKey, value.path])
                }
              }
            }
          })
          return createRequest(true, results)
        }),
      })),
    }
  }

  global.indexedDB = {
    open: jest.fn((name: string, version?: number) => {
      if (!databases.has(name)) {
        databases.set(name, { version: version || 1, stores: new Map() })
      }

      const dbInfo = databases.get(name)!
      const db = {
        name,
        version: dbInfo.version,
        objectStoreNames: { contains: (storeName: string) => dbInfo.stores.has(storeName) },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        transaction: jest.fn((..._args: any[]) => {
          const transactionHandlers: any = { onerror: null, oncomplete: null, onabort: null }
          const tx = {
            objectStore: jest.fn((storeName: string) => mockObjectStore(dbInfo, storeName)),
            get onerror() {
              return transactionHandlers.onerror
            },
            set onerror(h) {
              transactionHandlers.onerror = h
            },
            get oncomplete() {
              return transactionHandlers.oncomplete
            },
            set oncomplete(h) {
              transactionHandlers.oncomplete = h
              if (h) setTimeout(() => h({} as any), 0)
            },
            abort: jest.fn(),
          }
          return tx
        }),
        createObjectStore: jest.fn((storeName: string) => mockObjectStore(dbInfo, storeName)),
        deleteObjectStore: jest.fn((storeName: string) => {
          dbInfo.stores.delete(storeName)
        }),
        close: jest.fn(),
      }

      const request = createRequest(true, db)
      if (version && version > (dbInfo.version || 0)) {
        setTimeout(() => {
          if (request.onupgradeneeded) {
            request.onupgradeneeded({ target: { result: db, transaction: db.transaction([]) } } as any)
          }
        }, 0)
      }
      return request
    }),
    deleteDatabase: jest.fn((name: string) => {
      databases.delete(name)
      return createRequest(true)
    }),
    cmp: jest.fn(),
  } as any

  global.FileReader = class {
    onload: any = null
    onerror: any = null
    result: any = null
    readAsText(blob: Blob) {
      if (blob && (blob as any)._text !== undefined) {
        this.result = (blob as any)._text
        setTimeout(() => this.onload && this.onload(), 0)
      } else {
        this.result = ''
        setTimeout(() => this.onload && this.onload(), 0)
      }
    }
  } as any

  global.Blob = MockBlob as any

  global.window = {
    ...global.window,
    indexedDB: global.indexedDB,
    FileReader: global.FileReader,
    Blob: global.Blob,
  } as any

  return databases
}

export function cleanupIndexedDBMock() {
  if (mockDatabases) {
    mockDatabases.forEach((dbInfo) => {
      dbInfo.stores.clear()
    })
    mockDatabases.clear()
    mockDatabases = null
  }
  // @ts-ignore
  delete global.indexedDB
  if (global.window) {
    // @ts-ignore
    delete global.window.indexedDB
    // @ts-ignore
    delete global.window.FileReader
    // @ts-ignore
    delete global.window.Blob
  }
  // @ts-ignore
  delete global.FileReader
  // @ts-ignore
  delete global.Blob
}
