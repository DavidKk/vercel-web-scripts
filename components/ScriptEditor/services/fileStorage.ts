'use client'

import type { FileMetadata } from '../types'

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
 * Database configuration
 */
const DB_NAME = 'script_editor_storage'
const STORE_NAME = 'files'
const DB_VERSION = 1

/**
 * File storage service using IndexedDB
 * Manages file content and state persistence
 */
export class FileStorageService {
  private db: IDBDatabase | null = null

  /**
   * Get the current database version or determine appropriate version
   * @returns Current database version
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

  /**
   * Open IndexedDB database
   * @returns Database instance
   */
  private async openDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    if (typeof window === 'undefined') {
      throw new Error('IndexedDB is only available in browser environment')
    }

    const version = await this.getCurrentDBVersion()

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, Math.max(version, DB_VERSION))

      request.onerror = () => reject(request.error)
      request.onsuccess = (event: any) => {
        const db = event.target.result as IDBDatabase

        // Check if the object store exists after opening
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // eslint-disable-next-line no-console
          console.log(`[FileStorageService] Object store '${STORE_NAME}' not found in database, upgrading...`)
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
              console.log(`[FileStorageService] Created object store '${STORE_NAME}' successfully`)
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
          console.log(`[FileStorageService] Created object store '${STORE_NAME}' during initial upgrade`)
        }
      }
    })
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

    try {
      const db = await this.openDB()
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
        // eslint-disable-next-line no-console
        console.log('[FileStorageService] Object store not found, resetting database')
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
      const db = await this.openDB()

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
        const db = await this.openDB()

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
      const db = await this.openDB()
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
        // eslint-disable-next-line no-console
        console.log('[FileStorageService] Object store not found while clearing, resetting database')
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
    // Close current connection if exists
    if (this.db) {
      this.db.close()
      this.db = null
    }

    if (typeof window === 'undefined') {
      return
    }

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME)

      deleteRequest.onerror = () => reject(deleteRequest.error)
      deleteRequest.onsuccess = () => {
        // eslint-disable-next-line no-console
        console.log('[FileStorageService] Database reset successfully')
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
