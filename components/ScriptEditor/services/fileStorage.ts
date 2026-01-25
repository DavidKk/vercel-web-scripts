'use client'

import { type FileMetadata } from '../types'
import { createFileKey, INDEX_NAMES, indexedDBService, OBJECT_STORES } from './indexedDBService'

/**
 * File state record structure
 * Note: storageKey and path must exist as they are part of the composite primary key (keyPath)
 * This is a requirement of IndexedDB and cannot be avoided
 */
interface FileStateRecord {
  storageKey: string
  path: string
  status: string // FileStatus enum value as string
  updatedAt: number
}

/**
 * File content record structure (using Blob storage)
 * Note: storageKey and path must exist as they are part of the composite primary key (keyPath)
 */
interface FileContentRecord {
  storageKey: string
  path: string
  originalContent: Blob
  modifiedContent: Blob
}

/**
 * Legacy storage format (for migration)
 */
interface StoredFileRecord {
  path: string
  status: string
  originalContent: string
  modifiedContent: string
  updatedAt: number
}

/**
 * Convert string to Blob
 * @param content String content
 * @returns Blob object
 */
function stringToBlob(content: string): Blob {
  return new Blob([content], { type: 'text/plain;charset=utf-8' })
}

/**
 * Convert Blob to string
 * @param blob Blob object
 * @returns Promise that resolves to string content
 */
async function blobToString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result as string)
    }
    reader.onerror = () => {
      reject(new Error('Failed to read blob'))
    }
    reader.readAsText(blob, 'utf-8')
  })
}

/**
 * File storage service using IndexedDB
 * Manages file content and state persistence
 * Uses separate tables for file states and file contents (binary storage)
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
   * Process loaded content records (convert Blob to string)
   * This is called outside of the transaction to avoid TransactionInactiveError
   * @param stateRecords File state records
   * @param contentRecords Map of file paths to content records
   * @returns Processed files metadata
   */
  private async processLoadedContent(stateRecords: FileStateRecord[], contentRecords: Map<string, FileContentRecord | undefined>): Promise<Record<string, FileMetadata>> {
    const files: Record<string, FileMetadata> = {}

    for (const stateRecord of stateRecords) {
      const record = contentRecords.get(stateRecord.path)

      let originalContent = ''
      let modifiedContent = ''

      if (record) {
        try {
          // Convert Blob to string (outside transaction)
          originalContent = await blobToString(record.originalContent)
          modifiedContent = await blobToString(record.modifiedContent)
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[FileStorageService] Failed to read content:', error)
        }
      }

      const statusValues = ['unchanged', 'modified-unsaved', 'modified-saved', 'new-unsaved', 'new-saved', 'deleted']
      const status = statusValues.includes(stateRecord.status) ? (stateRecord.status as FileMetadata['status']) : ('unchanged' as FileMetadata['status'])

      files[stateRecord.path] = {
        path: stateRecord.path,
        status,
        content: {
          originalContent,
          modifiedContent,
        },
        updatedAt: stateRecord.updatedAt,
      }
    }

    return files
  }

  /**
   * Migrate data from old format to new table structure
   * Supports migration from:
   * - Old JSON format (FILES table)
   * - Separated original/modified contents tables (Version 3)
   * @param storageKey Storage key
   * @returns Whether migration was successful
   */
  private async migrateFromOldFormat(storageKey: string): Promise<boolean> {
    try {
      const db = await this.getDB()

      // Try migrating from old JSON format first
      if (db.objectStoreNames.contains('files')) {
        return new Promise((resolve) => {
          const transaction = db.transaction(['files'], 'readonly')
          const store = transaction.objectStore('files')
          const request = store.get(storageKey)

          request.onerror = () => {
            resolve(false)
          }

          request.onsuccess = async () => {
            const result = request.result
            if (!result) {
              resolve(false)
              return
            }

            try {
              // Parse old format data
              const data = result as Record<string, StoredFileRecord>
              const files: Record<string, FileMetadata> = {}

              // Convert old format to new format
              for (const [path, record] of Object.entries(data)) {
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
              }

              // Save to new table structure
              await this.saveFiles(storageKey, files)

              // Delete old data
              const deleteTransaction = db.transaction(['files'], 'readwrite')
              const deleteStore = deleteTransaction.objectStore('files')
              deleteStore.delete(storageKey)

              resolve(true)
            } catch (error) {
              // eslint-disable-next-line no-console
              console.error('[FileStorageService] Migration error:', error)
              resolve(false)
            }
          }
        })
      }

      // Try migrating from separated tables (Version 3)
      if (db.objectStoreNames.contains('originalContents') && db.objectStoreNames.contains('modifiedContents') && db.objectStoreNames.contains('fileStates')) {
        return new Promise(async (resolve) => {
          try {
            const transaction = db.transaction(['fileStates', 'originalContents', 'modifiedContents'], 'readonly')
            const stateStore = transaction.objectStore('fileStates')
            const originalStore = transaction.objectStore('originalContents')
            const modifiedStore = transaction.objectStore('modifiedContents')

            const index = stateStore.index('storageKey')
            const request = index.getAll(storageKey)

            request.onsuccess = async () => {
              try {
                const stateRecords = request.result as FileStateRecord[]
                const files: Record<string, FileMetadata> = {}

                for (const stateRecord of stateRecords) {
                  const fileKey = createFileKey(storageKey, stateRecord.path)

                  // Get original and modified content
                  const [originalRecord, modifiedRecord] = await Promise.all([
                    new Promise<{ content: Blob } | null>((resolve) => {
                      const req = originalStore.get(fileKey)
                      req.onsuccess = () => resolve(req.result as { content: Blob } | null)
                      req.onerror = () => resolve(null)
                    }),
                    new Promise<{ content: Blob } | null>((resolve) => {
                      const req = modifiedStore.get(fileKey)
                      req.onsuccess = () => resolve(req.result as { content: Blob } | null)
                      req.onerror = () => resolve(null)
                    }),
                  ])

                  const originalContent = originalRecord ? await blobToString(originalRecord.content) : ''
                  const modifiedContent = modifiedRecord ? await blobToString(modifiedRecord.content) : ''

                  const statusValues = ['unchanged', 'modified-unsaved', 'modified-saved', 'new-unsaved', 'new-saved', 'deleted']
                  const status = statusValues.includes(stateRecord.status) ? (stateRecord.status as FileMetadata['status']) : ('unchanged' as FileMetadata['status'])

                  files[stateRecord.path] = {
                    path: stateRecord.path,
                    status,
                    content: {
                      originalContent,
                      modifiedContent,
                    },
                    updatedAt: stateRecord.updatedAt,
                  }
                }

                // Save to new table structure
                await this.saveFiles(storageKey, files)
                resolve(true)
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error('[FileStorageService] Migration error:', error)
                resolve(false)
              }
            }

            request.onerror = () => {
              resolve(false)
            }
          } catch {
            resolve(false)
          }
        })
      }

      return false
    } catch {
      return false
    }
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

      // Load from new table structure
      return new Promise(async (resolve, reject) => {
        const transaction = db.transaction([OBJECT_STORES.FILE_STATES, OBJECT_STORES.FILE_CONTENTS], 'readonly')
        const stateStore = transaction.objectStore(OBJECT_STORES.FILE_STATES)
        const contentStore = transaction.objectStore(OBJECT_STORES.FILE_CONTENTS)

        // Query all files for this storageKey using index
        const index = stateStore.index(INDEX_NAMES.STORAGE_KEY)
        const request = index.getAll(storageKey)

        request.onerror = () => {
          // Query error, return null (don't try migration on query errors)
          resolve(null)
        }

        request.onsuccess = () => {
          const stateRecords = request.result as FileStateRecord[]

          if (stateRecords.length === 0) {
            // Try migrating from old format
            this.migrateFromOldFormat(storageKey)
              .then((migrated) => {
                if (migrated) {
                  // Migration successful, reload
                  this.loadFiles(storageKey).then(resolve).catch(reject)
                } else {
                  resolve(null)
                }
              })
              .catch(() => resolve(null))
            return
          }

          // Collect all content requests first (within transaction)
          const contentRequests: Array<{
            stateRecord: FileStateRecord
            request: IDBRequest<FileContentRecord | undefined>
          }> = []

          for (const stateRecord of stateRecords) {
            const fileKey = createFileKey(storageKey, stateRecord.path)
            const contentRequest = contentStore.get(fileKey)
            contentRequests.push({ stateRecord, request: contentRequest })
          }

          // Collect all content records within transaction
          const contentRecords = new Map<string, FileContentRecord | undefined>()

          if (contentRequests.length === 0) {
            resolve({})
            return
          }

          // Use transaction.oncomplete to ensure all data is collected before processing
          transaction.oncomplete = () => {
            // All requests completed, now process outside transaction
            this.processLoadedContent(stateRecords, contentRecords)
              .then((files: Record<string, FileMetadata>) => resolve(files))
              .catch((error: unknown) => {
                // eslint-disable-next-line no-console
                console.error('[FileStorageService] Failed to process content:', error)
                resolve({})
              })
          }

          transaction.onerror = () => {
            reject(transaction.error)
          }

          contentRequests.forEach(({ stateRecord, request }) => {
            request.onsuccess = () => {
              // Store result immediately (within transaction)
              contentRecords.set(stateRecord.path, request.result as FileContentRecord | undefined)
            }

            request.onerror = () => {
              // Store undefined on error
              contentRecords.set(stateRecord.path, undefined)
            }
          })
        }
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, try migration
        const migrated = await this.migrateFromOldFormat(storageKey)
        if (migrated) {
          return this.loadFiles(storageKey)
        }
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

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([OBJECT_STORES.FILE_STATES, OBJECT_STORES.FILE_CONTENTS], 'readwrite')
        const stateStore = transaction.objectStore(OBJECT_STORES.FILE_STATES)
        const contentStore = transaction.objectStore(OBJECT_STORES.FILE_CONTENTS)

        // Save all file states and contents
        const fileEntries = Object.entries(files)
        let completed = 0
        let hasError = false

        if (fileEntries.length === 0) {
          resolve()
          return
        }

        fileEntries.forEach(([, file]) => {
          // Save file state
          const stateRecord: FileStateRecord = {
            storageKey,
            path: file.path,
            status: file.status,
            updatedAt: file.updatedAt,
          }

          const stateRequest = stateStore.put(stateRecord)
          stateRequest.onerror = () => {
            if (!hasError) {
              hasError = true
              reject(stateRequest.error)
            }
          }

          // Save file content (both original and modified, convert to Blob)
          const contentRecord: FileContentRecord = {
            storageKey,
            path: file.path,
            originalContent: stringToBlob(file.content.originalContent),
            modifiedContent: stringToBlob(file.content.modifiedContent),
          }

          const contentRequest = contentStore.put(contentRecord)
          contentRequest.onerror = () => {
            if (!hasError) {
              hasError = true
              reject(contentRequest.error)
            }
          }

          // Wait for both requests to complete
          let stateDone = false
          let contentDone = false

          const checkComplete = () => {
            if (stateDone && contentDone) {
              completed++
              if (completed === fileEntries.length && !hasError) {
                resolve()
              }
            }
          }

          stateRequest.onsuccess = () => {
            stateDone = true
            checkComplete()
          }

          contentRequest.onsuccess = () => {
            contentDone = true
            checkComplete()
          }
        })
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // Object store not found, reset database and retry
        await this.resetDatabase()
        return this.saveFiles(storageKey, files)
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
        const transaction = db.transaction([OBJECT_STORES.FILE_STATES, OBJECT_STORES.FILE_CONTENTS], 'readwrite')
        const stateStore = transaction.objectStore(OBJECT_STORES.FILE_STATES)
        const contentStore = transaction.objectStore(OBJECT_STORES.FILE_CONTENTS)

        // Use index to find all matching records
        const stateIndex = stateStore.index(INDEX_NAMES.STORAGE_KEY)
        const stateRequest = stateIndex.getAllKeys(storageKey)

        stateRequest.onerror = () => {
          reject(stateRequest.error)
        }

        stateRequest.onsuccess = () => {
          const keys = stateRequest.result as [string, string][]

          if (keys.length === 0) {
            resolve()
            return
          }

          let deleted = 0
          let hasError = false

          keys.forEach((key) => {
            // Delete state record
            const stateDeleteRequest = stateStore.delete(key)
            stateDeleteRequest.onerror = () => {
              if (!hasError) {
                hasError = true
                reject(stateDeleteRequest.error)
              }
            }

            // Delete content record
            const contentDeleteRequest = contentStore.delete(key)
            contentDeleteRequest.onerror = () => {
              if (!hasError) {
                hasError = true
                reject(contentDeleteRequest.error)
              }
            }

            // Wait for both deletions to complete
            let stateDone = false
            let contentDone = false

            const checkComplete = () => {
              if (stateDone && contentDone) {
                deleted++
                if (deleted === keys.length && !hasError) {
                  resolve()
                }
              }
            }

            stateDeleteRequest.onsuccess = () => {
              stateDone = true
              checkComplete()
            }

            contentDeleteRequest.onsuccess = () => {
              contentDone = true
              checkComplete()
            }
          })
        }
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
