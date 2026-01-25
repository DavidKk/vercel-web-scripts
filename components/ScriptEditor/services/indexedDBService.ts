'use client'

import { createObjectStore, DB_NAME, DB_VERSION, OBJECT_STORES, STORE_CONFIGS } from '../conf/indexedDBConfig'

// 重新导出配置，保持向后兼容
export { createFileKey, INDEX_NAMES, OBJECT_STORES } from '../conf/indexedDBConfig'

/**
 * Unified IndexedDB service
 * Manages database connection and object stores
 * Singleton pattern to ensure only one database connection
 */
export class IndexedDBService {
  private static instance: IndexedDBService | null = null
  private db: IDBDatabase | null = null
  private isInitializing = false
  private initPromise: Promise<IDBDatabase> | null = null

  /**
   * Get singleton instance
   * @returns IndexedDBService instance
   */
  static getInstance(): IndexedDBService {
    if (!IndexedDBService.instance) {
      IndexedDBService.instance = new IndexedDBService()
    }
    return IndexedDBService.instance
  }

  /**
   * Check if IndexedDB is available
   * @returns Whether IndexedDB is available
   */
  isAvailable(): boolean {
    if (typeof window === 'undefined') {
      return false
    }
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null
    } catch {
      return false
    }
  }

  /**
   * Get the current database version
   * @returns Current database version
   */
  private async getCurrentDBVersion(): Promise<number> {
    if (!this.isAvailable()) {
      return 1
    }

    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME)

        request.onerror = () => {
          resolve(1)
        }

        request.onsuccess = (event: any) => {
          try {
            const db = event.target.result as IDBDatabase
            const currentVersion = db.version || 1
            db.close()
            resolve(currentVersion)
          } catch {
            resolve(1)
          }
        }

        request.onupgradeneeded = () => {
          resolve(1)
        }
      } catch {
        resolve(1)
      }
    })
  }

  /**
   * Open IndexedDB database
   * Ensures all required object stores exist
   * @returns Database instance
   */
  async openDB(): Promise<IDBDatabase> {
    // Return existing connection if available and valid
    if (this.db) {
      try {
        // Check if connection is still valid
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _storeNames = this.db.objectStoreNames
        return this.db
      } catch {
        // Connection is closed or invalid, reset it
        this.db = null
      }
    }

    // If already initializing, wait for the existing promise
    if (this.isInitializing && this.initPromise) {
      return this.initPromise
    }

    // Check if IndexedDB is available
    if (!this.isAvailable()) {
      throw new Error('IndexedDB is not available in this environment')
    }

    // Start initialization
    this.isInitializing = true

    this.initPromise = (async () => {
      try {
        const version = await this.getCurrentDBVersion()

        return new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, Math.max(version, DB_VERSION))

          request.onerror = () => {
            this.isInitializing = false
            this.initPromise = null
            // eslint-disable-next-line no-console
            console.error('[IndexedDBService] Error opening database:', request.error)
            reject(request.error)
          }

          request.onsuccess = (event: any) => {
            const db = event.target.result as IDBDatabase

            // Check if all required object stores exist
            const requiredStores = Object.values(OBJECT_STORES)
            const missingStores = requiredStores.filter((storeName) => !db.objectStoreNames.contains(storeName))

            if (missingStores.length > 0) {
              // eslint-disable-next-line no-console
              console.log(`[IndexedDBService] Missing stores detected: ${missingStores.join(', ')}, current version: ${version}, target version: ${DB_VERSION}`)
              db.close()

              // Open with a higher version to trigger onupgradeneeded
              // Use Math.max to ensure we upgrade to at least DB_VERSION
              const upgradeVersion = Math.max(version + 1, DB_VERSION)
              // eslint-disable-next-line no-console
              console.log(`[IndexedDBService] Opening database with version ${upgradeVersion} to create missing stores`)
              const upgradeRequest = indexedDB.open(DB_NAME, upgradeVersion)

              let upgradeCompleted = false
              let upgradeBlocked = false

              // Set up onupgradeneeded FIRST (must be before onsuccess)
              upgradeRequest.onupgradeneeded = (upgradeEvent: any) => {
                const upgradeDb = upgradeEvent.target.result

                // eslint-disable-next-line no-console
                console.log('[IndexedDBService] Database upgrade triggered (missing stores), creating stores...')
                // eslint-disable-next-line no-console
                console.log(`[IndexedDBService] Missing stores: ${missingStores.join(', ')}`)
                // 使用配置创建所有对象存储
                Object.values(STORE_CONFIGS).forEach((config) => {
                  if (!upgradeDb.objectStoreNames.contains(config.name)) {
                    // eslint-disable-next-line no-console
                    console.log(`[IndexedDBService] Creating object store: ${config.name}`)
                    createObjectStore(upgradeDb, config)
                  }
                })

                upgradeCompleted = true
              }

              upgradeRequest.onerror = () => {
                this.isInitializing = false
                this.initPromise = null
                // eslint-disable-next-line no-console
                console.error('[IndexedDBService] Error during upgrade:', upgradeRequest.error)
                reject(upgradeRequest.error)
              }

              upgradeRequest.onsuccess = () => {
                this.isInitializing = false
                this.initPromise = null
                const upgradedDb = upgradeRequest.result
                this.db = upgradedDb
                resolve(upgradedDb)
              }

              upgradeRequest.onblocked = () => {
                upgradeBlocked = true
                // Set a timeout to retry if blocked for too long
                setTimeout(() => {
                  if (upgradeBlocked && !upgradeCompleted) {
                    // Retry by calling openDB again
                    this.db = null
                    this.isInitializing = false
                    this.initPromise = null
                    this.openDB()
                      .then((retryDb) => {
                        this.db = retryDb
                        resolve(retryDb)
                      })
                      .catch(reject)
                  }
                }, 2000)
              }
            } else {
              // All object stores exist
              this.isInitializing = false
              this.initPromise = null
              this.db = db
              resolve(db)
            }
          }

          request.onupgradeneeded = (event: any) => {
            const db = event.target.result

            // eslint-disable-next-line no-console
            console.log('[IndexedDBService] Database upgrade triggered, creating missing stores...')
            // 使用配置创建所有对象存储
            Object.values(STORE_CONFIGS).forEach((config) => {
              if (!db.objectStoreNames.contains(config.name)) {
                // eslint-disable-next-line no-console
                console.log(`[IndexedDBService] Creating object store: ${config.name}`)
                createObjectStore(db, config)
              }
            })
          }
        })
      } catch (error) {
        this.isInitializing = false
        this.initPromise = null
        throw error
      }
    })()

    return this.initPromise
  }

  /**
   * Get database instance (opens if not already open)
   * @returns Database instance
   */
  async getDB(): Promise<IDBDatabase> {
    return this.openDB()
  }

  /**
   * Close database connection
   */
  closeDB(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Check if an object store exists
   * @param storeName Object store name
   * @returns Whether the object store exists
   */
  async hasObjectStore(storeName: string): Promise<boolean> {
    try {
      const db = await this.getDB()
      return db.objectStoreNames.contains(storeName)
    } catch {
      return false
    }
  }
}

/**
 * Singleton instance of IndexedDBService
 */
export const indexedDBService = IndexedDBService.getInstance()
