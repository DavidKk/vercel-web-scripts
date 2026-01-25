'use client'

export interface LocalFileRecord {
  path: string
  content: string | null // null means deleted
  updatedAt: number
  status: 'modified' | 'added' | 'deleted'
}

const DB_NAME = 'tampermonkey_editor'
const STORE_NAME = 'drafts'

/**
 * Simple IndexedDB wrapper for managing local drafts
 */
export class DraftStorage {
  private db: IDBDatabase | null = null

  /**
   * Get the current database version or determine appropriate version
   */
  private async getCurrentDBVersion(): Promise<number> {
    return new Promise((resolve) => {
      // Try to open without version to get current version
      const request = indexedDB.open(DB_NAME)

      request.onerror = () => {
        // If database doesn't exist, start with version 1
        resolve(1)
      }

      request.onsuccess = (event: any) => {
        const db = event.target.result as IDBDatabase
        const currentVersion = db.version || 1
        db.close()
        resolve(currentVersion)
      }

      request.onupgradeneeded = () => {
        // This shouldn't happen when opening without version, but handle it
        resolve(1)
      }
    })
  }

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    const version = await this.getCurrentDBVersion()

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, version)

      request.onerror = () => reject(request.error)
      request.onsuccess = (event: any) => {
        const db = event.target.result as IDBDatabase

        // Check if the object store exists after opening
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.log(`[DraftStorage] Object store '${STORE_NAME}' not found in database, upgrading...`)
          // Object store doesn't exist, need to upgrade
          db.close()

          // Open with a higher version to trigger onupgradeneeded
          const upgradeRequest = indexedDB.open(DB_NAME, version + 1)

          upgradeRequest.onerror = () => reject(upgradeRequest.error)
          upgradeRequest.onsuccess = () => {
            this.db = upgradeRequest.result
            resolve(upgradeRequest.result)
          }
          upgradeRequest.onupgradeneeded = (upgradeEvent: any) => {
            const upgradeDb = upgradeEvent.target.result
            if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
              upgradeDb.createObjectStore(STORE_NAME)
              // eslint-disable-next-line no-console
              console.log(`[DraftStorage] Created object store '${STORE_NAME}' successfully`)
            }
          }
        } else {
          this.db = db
          resolve(db)
        }
      }

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
          // eslint-disable-next-line no-console
          console.log(`[DraftStorage] Created object store '${STORE_NAME}' during initial upgrade`)
        }
      }
    })
  }

  /**
   * Save local drafts for a Gist
   * @param gistId Gist identifier
   * @param files Files to save
   */
  async saveFiles(gistId: string, files: Record<string, LocalFileRecord>): Promise<void> {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(files, gistId)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database and retry
        await this.resetDatabase()
        const db = await this.openDB()
        return new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readwrite')
          const store = transaction.objectStore(STORE_NAME)
          const request = store.put(files, gistId)

          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve()
        })
      }
      throw error
    }
  }

  /**
   * Get local drafts for a Gist
   * @param gistId Gist identifier
   * @returns Draft files or null if not found
   */
  async getFiles(gistId: string): Promise<Record<string, LocalFileRecord> | null> {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(gistId)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result || null)
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database and return null
        // eslint-disable-next-line no-console
        console.log('[DraftStorage] Object store not found, resetting database')
        await this.resetDatabase()
        return null
      }
      throw error
    }
  }

  /**
   * Clear local drafts for a Gist
   * @param gistId Gist identifier
   */
  async clearFiles(gistId: string): Promise<void> {
    try {
      const db = await this.openDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(gistId)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database (nothing to clear anyway)
        // eslint-disable-next-line no-console
        console.log('[DraftStorage] Object store not found while clearing, resetting database')
        await this.resetDatabase()
        return
      }
      throw error
    }
  }

  /**
   * Reset the entire database (for troubleshooting)
   * This will delete all stored drafts
   */
  async resetDatabase(): Promise<void> {
    // Close current connection if exists
    if (this.db) {
      this.db.close()
      this.db = null
    }

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME)

      deleteRequest.onerror = () => reject(deleteRequest.error)
      deleteRequest.onsuccess = () => {
        // eslint-disable-next-line no-console
        console.log('[DraftStorage] Database reset successfully')
        resolve()
      }
      deleteRequest.onblocked = () => {
        // eslint-disable-next-line no-console
        console.warn('[DraftStorage] Database reset blocked, please close all tabs and try again')
        reject(new Error('Database reset blocked, please close all tabs and try again'))
      }
    })
  }
}

export const draftStorage = new DraftStorage()
