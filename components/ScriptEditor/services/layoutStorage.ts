'use client'

import { indexedDBService, OBJECT_STORES } from './indexedDBService'

/**
 * Layout state structure for IndexedDB
 */
interface LayoutState {
  /** Left panel width */
  leftPanelWidth: number
  /** Right panel width */
  rightPanelWidth: number
  /** Right panel type: string | null */
  rightPanelType: string | null
  /** Last updated timestamp */
  updatedAt: number
}

/**
 * Object store name for layout
 */
const STORE_NAME = OBJECT_STORES.LAYOUT
const DEFAULT_STORAGE_KEY = 'editorLayoutState'

/**
 * Layout storage service using IndexedDB
 * Manages editor layout state persistence (panel sizes and open panels)
 */
export class LayoutStorageService {
  /**
   * Get database instance
   * @returns Database instance
   */
  private async getDB(): Promise<IDBDatabase> {
    return indexedDBService.getDB()
  }

  /**
   * Save layout state to IndexedDB
   * @param state Layout state to save
   * @param storageKey Optional storage key
   */
  async saveLayoutState(state: { leftPanelWidth: number; rightPanelWidth: number; rightPanelType: string | null }, storageKey: string = DEFAULT_STORAGE_KEY): Promise<void> {
    if (!indexedDBService.isAvailable()) {
      // eslint-disable-next-line no-console
      console.warn('[LayoutStorageService] IndexedDB is not available, cannot save layout state')
      return
    }

    try {
      const db = await this.getDB()

      // Verify that the object store exists before trying to use it
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Wait a bit and retry (in case upgrade is in progress)
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Retry opening the database
        const retryDb = await this.getDB()
        if (!retryDb.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.error(`[LayoutStorageService] Object store '${STORE_NAME}' still not found after retry, cannot save`)
          // eslint-disable-next-line no-console
          console.error(`[LayoutStorageService] Available stores: ${Array.from(retryDb.objectStoreNames).join(', ')}`)
          return
        }
        // Use the retry database
        const transaction = retryDb.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        // Continue with the rest of the logic using retryDb
        await this.writeStateToStore(store, state, storageKey)
        // eslint-disable-next-line no-console
        console.log(`[LayoutStorageService] Layout state saved successfully (after retry) for key: ${storageKey}`)
        return
      }

      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      await this.writeStateToStore(store, state, storageKey)
      // eslint-disable-next-line no-console
      console.log(`[LayoutStorageService] Layout state saved successfully for key: ${storageKey}`, state)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LayoutStorageService] Failed to save layout state to IndexedDB:', error)
      throw error
    }
  }

  /**
   * Write state to object store
   * @param store Object store instance
   * @param state Layout state
   * @param storageKey Storage key
   */
  private async writeStateToStore(
    store: IDBObjectStore,
    state: { leftPanelWidth: number; rightPanelWidth: number; rightPanelType: string | null },
    storageKey: string
  ): Promise<void> {
    const layoutState: LayoutState = {
      ...state,
      updatedAt: Date.now(),
    }

    return new Promise<void>((resolve, reject) => {
      const request = store.put(layoutState, storageKey)

      request.onsuccess = () => {
        resolve()
      }
      request.onerror = () => {
        // eslint-disable-next-line no-console
        console.error('[LayoutStorageService] Error saving state:', request.error)
        reject(request.error)
      }
    })
  }

  /**
   * Read state from object store
   * @param store Object store instance
   * @param storageKey Storage key
   * @returns Layout state or null if not found
   */
  private async readStateFromStore(store: IDBObjectStore, storageKey: string): Promise<{ leftPanelWidth: number; rightPanelWidth: number; rightPanelType: string | null } | null> {
    const state = await new Promise<LayoutState | undefined>((resolve, reject) => {
      const request = store.get(storageKey)
      request.onsuccess = () => {
        resolve(request.result)
      }
      request.onerror = () => {
        // eslint-disable-next-line no-console
        console.error('[LayoutStorageService] Read request error:', request.error)
        reject(request.error)
      }
    })

    if (!state) {
      return null
    }

    return {
      leftPanelWidth: state.leftPanelWidth || 250,
      rightPanelWidth: state.rightPanelWidth || 400,
      rightPanelType: state.rightPanelType || null,
    }
  }

  /**
   * Load layout state from IndexedDB
   * @param storageKey Optional storage key
   * @returns Layout state or null if not found
   */
  async loadLayoutState(storageKey: string = DEFAULT_STORAGE_KEY): Promise<{ leftPanelWidth: number; rightPanelWidth: number; rightPanelType: string | null } | null> {
    if (!indexedDBService.isAvailable()) {
      // eslint-disable-next-line no-console
      console.warn('[LayoutStorageService] IndexedDB is not available, cannot load layout state')
      return null
    }

    try {
      const db = await this.getDB()

      // Verify that the object store exists before trying to use it
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Wait a bit and retry (in case upgrade is in progress)
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Retry opening the database
        const retryDb = await this.getDB()
        if (!retryDb.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.warn(`[LayoutStorageService] Object store '${STORE_NAME}' not found after retry, returning null`)
          // eslint-disable-next-line no-console
          console.warn(`[LayoutStorageService] Available stores: ${Array.from(retryDb.objectStoreNames).join(', ')}`)
          return null
        }
        // Use the retry database
        const transaction = retryDb.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)

        // Continue with the rest of the logic using retryDb
        return await this.readStateFromStore(store, storageKey)
      }

      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      const result = await this.readStateFromStore(store, storageKey)
      // eslint-disable-next-line no-console
      console.log(`[LayoutStorageService] Layout state loaded for key ${storageKey}:`, result)
      return result
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LayoutStorageService] Failed to load layout state from IndexedDB:', error)
      return null
    }
  }

  /**
   * Clear layout state from IndexedDB
   * @param storageKey Optional storage key
   */
  async clearLayoutState(storageKey: string = DEFAULT_STORAGE_KEY): Promise<void> {
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
          console.error(`[LayoutStorageService] Object store '${STORE_NAME}' still not found after retry, cannot clear`)
          return
        }
        // Use the retry database
        const transaction = retryDb.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)

        await new Promise<void>((resolve, reject) => {
          const request = store.delete(storageKey)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
        return
      }

      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(storageKey)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LayoutStorageService] Failed to clear layout state from IndexedDB:', error)
    }
  }
}

/**
 * Singleton instance of LayoutStorageService
 */
export const layoutStorageService = new LayoutStorageService()
