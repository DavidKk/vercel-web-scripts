'use client'

import type { FileMetadata } from '../types'
import { indexedDBService, OBJECT_STORES } from './indexedDBService'

/**
 * Stored file record structure for IndexedDB
 * Note: status is stored as string in IndexedDB (enum values are strings)
 */
interface StoredFileRecord {
  path: string
  status: string // FileStatus enum value as string
  originalContent: string
  modifiedContent: string
  updatedAt: number
}

/**
 * Object store name for files
 */
const STORE_NAME = OBJECT_STORES.FILES

/**
 * File storage service using IndexedDB
 * Manages file content and state persistence
 */
export class FileStorageService {
  /**
   * Get database instance
   * @returns Database instance
   */
  private async getDB(): Promise<IDBDatabase> {
    return indexedDBService.getDB()
  }

  /**
   * Load files from IndexedDB
   * @param storageKey Unique key for this storage instance
   * @returns Loaded files or null if not found
   */
  async loadFiles(storageKey: string): Promise<Record<string, FileMetadata> | null> {
    if (typeof window === 'undefined') {
      return null
    }

    if (!indexedDBService.isAvailable()) {
      return null
    }

    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(storageKey)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const result = request.result
          if (!result) {
            resolve(null)
            return
          }

          // Convert stored records to FileMetadata
          const data = result as Record<string, StoredFileRecord>
          const files: Record<string, FileMetadata> = {}

          Object.entries(data).forEach(([path, record]) => {
            // Convert string status to enum - validate it's a valid FileStatus value
            const statusValues = ['unchanged', 'modified-unsaved', 'modified-saved', 'new-unsaved', 'new-saved', 'deleted']
            const status = statusValues.includes(record.status) ? (record.status as FileMetadata['status']) : ('unchanged' as FileMetadata['status'])

            files[path] = {
              path: record.path,
              status,
              content: {
                originalContent: record.originalContent,
                modifiedContent: record.modifiedContent,
              },
              updatedAt: record.updatedAt,
            }
          })

          resolve(files)
        }
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database and return null
        await this.resetDatabase()
        return null
      }
      // eslint-disable-next-line no-console
      console.error('[FileStorageService] Failed to load files from IndexedDB:', error)
      return null
    }
  }

  /**
   * Save files to IndexedDB
   * @param storageKey Unique key for this storage instance
   * @param files Files to save
   */
  async saveFiles(storageKey: string, files: Record<string, FileMetadata>): Promise<void> {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const db = await this.getDB()

      // Convert FileMetadata to StoredFileRecord
      const data: Record<string, StoredFileRecord> = {}

      Object.entries(files).forEach(([path, file]) => {
        data[path] = {
          path: file.path,
          status: file.status, // Enum value will be serialized as string
          originalContent: file.content.originalContent,
          modifiedContent: file.content.modifiedContent,
          updatedAt: file.updatedAt,
        }
      })

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(data, storageKey)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database and retry
        await this.resetDatabase()
        const db = await this.getDB()

        // Rebuild data for retry
        const retryData: Record<string, StoredFileRecord> = {}
        Object.entries(files).forEach(([path, file]) => {
          retryData[path] = {
            path: file.path,
            status: file.status,
            originalContent: file.content.originalContent,
            modifiedContent: file.content.modifiedContent,
            updatedAt: file.updatedAt,
          }
        })

        return new Promise((resolve, reject) => {
          const transaction = db.transaction([STORE_NAME], 'readwrite')
          const store = transaction.objectStore(STORE_NAME)
          const request = store.put(retryData, storageKey)

          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve()
        })
      }
      // eslint-disable-next-line no-console
      console.error('[FileStorageService] Failed to save files to IndexedDB:', error)
      throw error
    }
  }

  /**
   * Clear all files from IndexedDB for a specific storage key
   * @param storageKey Unique key for this storage instance
   */
  async clearFiles(storageKey: string): Promise<void> {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(storageKey)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database (nothing to clear anyway)
        await this.resetDatabase()
        return
      }
      // eslint-disable-next-line no-console
      console.error('[FileStorageService] Failed to clear files from IndexedDB:', error)
      throw error
    }
  }

  /**
   * Reset the entire database (for troubleshooting)
   * This will delete all stored files
   */
  async resetDatabase(): Promise<void> {
    // Close current connection
    indexedDBService.closeDB()

    if (typeof window === 'undefined' || !indexedDBService.isAvailable()) {
      return
    }

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase('script_editor_storage')

      deleteRequest.onerror = () => reject(deleteRequest.error)
      deleteRequest.onsuccess = () => {
        resolve()
      }
      deleteRequest.onblocked = () => {
        // eslint-disable-next-line no-console
        console.warn('[FileStorageService] Database reset blocked, please close all tabs and try again')
        reject(new Error('Database reset blocked, please close all tabs and try again'))
      }
    })
  }
}

/**
 * Singleton instance of FileStorageService
 */
export const fileStorageService = new FileStorageService()
