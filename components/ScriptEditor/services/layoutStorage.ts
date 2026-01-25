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
  /** Right panel type: 'ai' | 'rules' | null */
  rightPanelType: 'ai' | 'rules' | null
  /** Last updated timestamp */
  updatedAt: number
}

/**
 * Object store name for layout
 */
const STORE_NAME = OBJECT_STORES.LAYOUT
const STORAGE_KEY = 'editorLayoutState'

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
   */
  async saveLayoutState(state: { leftPanelWidth: number; rightPanelWidth: number; rightPanelType: 'ai' | 'rules' | null }): Promise<void> {
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
        await this.writeStateToStore(store, state)
        // eslint-disable-next-line no-console
        console.log('[LayoutStorageService] Layout state saved successfully (after retry)')
        return
      }

      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      await this.writeStateToStore(store, state)
      // eslint-disable-next-line no-console
      console.log('[LayoutStorageService] Layout state saved successfully', state)
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
   */
  private async writeStateToStore(store: IDBObjectStore, state: { leftPanelWidth: number; rightPanelWidth: number; rightPanelType: 'ai' | 'rules' | null }): Promise<void> {
    const layoutState: LayoutState = {
      ...state,
      updatedAt: Date.now(),
    }

    return new Promise<void>((resolve, reject) => {
      const request = store.put(layoutState, STORAGE_KEY)

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
   * @returns Layout state or null if not found
   */
  private async readStateFromStore(store: IDBObjectStore): Promise<{ leftPanelWidth: number; rightPanelWidth: number; rightPanelType: 'ai' | 'rules' | null } | null> {
    const state = await new Promise<LayoutState | undefined>((resolve, reject) => {
      const request = store.get(STORAGE_KEY)
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
   * @returns Layout state or null if not found
   */
  async loadLayoutState(): Promise<{ leftPanelWidth: number; rightPanelWidth: number; rightPanelType: 'ai' | 'rules' | null } | null> {
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
        return await this.readStateFromStore(store)
      }

      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)

      const result = await this.readStateFromStore(store)
      // eslint-disable-next-line no-console
      console.log('[LayoutStorageService] Layout state loaded:', result)
      return result
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LayoutStorageService] Failed to load layout state from IndexedDB:', error)
      return null
    }
  }

  /**
   * Clear layout state from IndexedDB
   */
  async clearLayoutState(): Promise<void> {
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
      console.error('[LayoutStorageService] Failed to clear layout state from IndexedDB:', error)
    }
  }
}

/**
 * Singleton instance of LayoutStorageService
 */
export const layoutStorageService = new LayoutStorageService()
