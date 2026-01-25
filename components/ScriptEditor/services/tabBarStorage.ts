'use client'

import { indexedDBService, OBJECT_STORES } from './indexedDBService'

/**
 * Tab bar state structure for IndexedDB
 */
interface TabBarState {
  /** List of open tabs (file paths) */
  openTabs: string[]
  /** Currently active tab path */
  activeTab: string | null
  /** Last updated timestamp */
  updatedAt: number
}

/**
 * Object store name for tabs
 */
const STORE_NAME = OBJECT_STORES.TABS
const STORAGE_KEY = 'tabBarState'

/**
 * Tab bar storage service using IndexedDB
 * Manages tab bar state persistence (open tabs and active tab)
 */
export class TabBarStorageService {
  /**
   * Get database instance
   * @returns Database instance
   */
  private async getDB(): Promise<IDBDatabase> {
    return indexedDBService.getDB()
  }

  /**
   * Save tab bar state to IndexedDB
   * @param openTabs List of open tabs
   * @param activeTab Currently active tab
   */
  async saveTabBarState(openTabs: string[], activeTab: string | null): Promise<void> {
    if (!indexedDBService.isAvailable()) {
      return
    }

    try {
      const db = await this.getDB()

      // Verify that the object store exists before trying to use it
      if (!(await indexedDBService.hasObjectStore(STORE_NAME))) {
        // Wait a bit and retry (in case upgrade is in progress)
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Retry opening the database
        const retryDb = await this.getDB()
        if (!retryDb.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.error(`[TabBarStorageService] Object store '${STORE_NAME}' still not found after retry, cannot save`)
          return
        }
        // Use the retry database
        const transaction = retryDb.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        // Continue with the rest of the logic using retryDb
        await this.writeStateToStore(store, openTabs, activeTab)
        return
      }

      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      await this.writeStateToStore(store, openTabs, activeTab)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TabBarStorageService] Failed to save tab bar state to IndexedDB:', error)
    }
  }

  /**
   * Write state to object store
   * @param store Object store instance
   * @param openTabs List of open tabs
   * @param activeTab Currently active tab
   */
  private async writeStateToStore(store: IDBObjectStore, openTabs: string[], activeTab: string | null): Promise<void> {
    const state: TabBarState = {
      openTabs,
      activeTab,
      updatedAt: Date.now(),
    }

    return new Promise<void>((resolve, reject) => {
      const request = store.put(state, STORAGE_KEY)

      request.onsuccess = () => {
        resolve()
      }
      request.onerror = () => {
        // eslint-disable-next-line no-console
        console.error('[TabBarStorageService] Error saving state:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Read state from object store
   * @param store Object store instance
   * @returns Tab bar state or null if not found
   */
  private async readStateFromStore(store: IDBObjectStore): Promise<{ openTabs: string[]; activeTab: string | null } | null> {
    const state = await new Promise<TabBarState | undefined>((resolve, reject) => {
      const request = store.get(STORAGE_KEY)
      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        // eslint-disable-next-line no-console
        console.error('[TabBarStorageService] Read request error:', request.error)
        reject(request.error)
      }
    })

    if (!state) {
      return null
    }

    return {
      openTabs: state.openTabs || [],
      activeTab: state.activeTab || null,
    }
  }

  /**
   * Load tab bar state from IndexedDB
   * @returns Tab bar state or null if not found
   */
  async loadTabBarState(): Promise<{ openTabs: string[]; activeTab: string | null } | null> {
    if (!indexedDBService.isAvailable()) {
      return null
    }

    try {
      const db = await this.getDB()

      // Verify that the object store exists before trying to use it
      if (!(await indexedDBService.hasObjectStore(STORE_NAME))) {
        // Wait a bit and retry (in case upgrade is in progress)
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Retry opening the database
        const retryDb = await this.getDB()
        if (!retryDb.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.error(`[TabBarStorageService] Object store '${STORE_NAME}' still not found after retry, returning null`)
          return null
        }
        // Use the retry database
        const transaction = retryDb.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)

        // Continue with the rest of the logic using retryDb
        return await this.readStateFromStore(store)
      }

      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      return await this.readStateFromStore(store)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TabBarStorageService] Failed to load tab bar state from IndexedDB:', error)
      return null
    }
  }

  /**
   * Clear tab bar state from IndexedDB
   */
  async clearTabBarState(): Promise<void> {
    if (!indexedDBService.isAvailable()) {
      return
    }

    try {
      const db = await this.getDB()

      // Verify that the object store exists before trying to use it
      if (!(await indexedDBService.hasObjectStore(STORE_NAME))) {
        // Wait a bit and retry (in case upgrade is in progress)
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Retry opening the database
        const retryDb = await this.getDB()
        if (!retryDb.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.error(`[TabBarStorageService] Object store '${STORE_NAME}' still not found after retry, cannot clear`)
          return
        }
        // Use the retry database
        const transaction = retryDb.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        await new Promise<void>((resolve, reject) => {
          const request = store.delete(STORAGE_KEY)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
        return
      }

      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(STORAGE_KEY)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TabBarStorageService] Failed to clear tab bar state from IndexedDB:', error)
    }
  }
}

/**
 * Singleton instance of TabBarStorageService
 */
export const tabBarStorageService = new TabBarStorageService()
