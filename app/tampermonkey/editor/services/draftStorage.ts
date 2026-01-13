'use client'

export interface LocalFileRecord {
  path: string
  content: string | null // null means deleted
  updatedAt: number
  status: 'modified' | 'added' | 'deleted'
}

const DB_NAME = 'tampermonkey_editor'
const STORE_NAME = 'drafts'
const DB_VERSION = 1

/**
 * Simple IndexedDB wrapper for managing local drafts
 */
export class DraftStorage {
  private db: IDBDatabase | null = null

  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
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
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(files, gistId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Get local drafts for a Gist
   * @param gistId Gist identifier
   * @returns Draft files or null if not found
   */
  async getFiles(gistId: string): Promise<Record<string, LocalFileRecord> | null> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(gistId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }

  /**
   * Clear local drafts for a Gist
   * @param gistId Gist identifier
   */
  async clearFiles(gistId: string): Promise<void> {
    const db = await this.openDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(gistId)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

export const draftStorage = new DraftStorage()
