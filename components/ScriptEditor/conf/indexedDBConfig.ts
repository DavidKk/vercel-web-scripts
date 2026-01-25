'use client'

/**
 * IndexedDB database configuration
 */

/**
 * Database name
 */
export const DB_NAME = 'script_editor_storage'

/**
 * Database version
 * Upgraded to support new table structure
 * Version 2: Separated file states and contents
 * Version 3: Separated original contents and modified contents
 * Version 4: Merged file contents into single table, simplified table structure
 */
export const DB_VERSION = 4

/**
 * Object store (table) names
 */
export const OBJECT_STORES = {
  /** File states table */
  FILE_STATES: 'fileStates',
  /** File contents table (binary storage, contains both original and modified content) */
  FILE_CONTENTS: 'fileContents',
  /** Tabs table */
  TABS: 'tabs',
} as const

/**
 * Index names
 */
export const INDEX_NAMES = {
  /** File path index */
  PATH: 'path',
  /** Storage key index */
  STORAGE_KEY: 'storageKey',
} as const

/**
 * Object store configuration
 * Defines the structure, primary key, and indexes for each table
 */
export interface ObjectStoreConfig {
  /** Table name */
  name: string
  /** Primary key path (keyPath) */
  keyPath?: string | string[]
  /** Whether to use auto-increment primary key */
  autoIncrement?: boolean
  /** Index configuration */
  indexes?: Array<{
    /** Index name */
    name: string
    /** Index key path */
    keyPath: string | string[]
    /** Whether the index is unique */
    unique?: boolean
  }>
}

/**
 * Common indexes for file-related tables
 * All file-related tables use the same index structure
 */
const FILE_TABLE_INDEXES: ObjectStoreConfig['indexes'] = [
  {
    name: INDEX_NAMES.PATH,
    keyPath: 'path',
    unique: false,
  },
  {
    name: INDEX_NAMES.STORAGE_KEY,
    keyPath: 'storageKey',
    unique: false,
  },
]

/**
 * Create a file-related table configuration
 * @param storeName Object store name
 * @returns Object store configuration
 */
function createFileTableConfig(storeName: string): ObjectStoreConfig {
  return {
    name: storeName,
    keyPath: ['storageKey', 'path'],
    indexes: FILE_TABLE_INDEXES,
  }
}

/**
 * Create a simple table configuration without keyPath
 * @param storeName Object store name
 * @returns Object store configuration
 */
function createSimpleTableConfig(storeName: string): ObjectStoreConfig {
  return {
    name: storeName,
    // No keyPath, uses external key
  }
}

/**
 * File states table configuration
 */
export const FILE_STATES_STORE_CONFIG: ObjectStoreConfig = createFileTableConfig(OBJECT_STORES.FILE_STATES)

/**
 * File contents table configuration
 */
export const FILE_CONTENTS_STORE_CONFIG: ObjectStoreConfig = createFileTableConfig(OBJECT_STORES.FILE_CONTENTS)

/**
 * Tabs table configuration
 */
export const TABS_STORE_CONFIG: ObjectStoreConfig = createSimpleTableConfig(OBJECT_STORES.TABS)

/**
 * All object store configuration mappings
 */
export const STORE_CONFIGS: Record<string, ObjectStoreConfig> = {
  [OBJECT_STORES.FILE_STATES]: FILE_STATES_STORE_CONFIG,
  [OBJECT_STORES.FILE_CONTENTS]: FILE_CONTENTS_STORE_CONFIG,
  [OBJECT_STORES.TABS]: TABS_STORE_CONFIG,
}

/**
 * Create an object store
 * @param db Database instance
 * @param config Store configuration
 * @returns Created object store
 */
export function createObjectStore(db: IDBDatabase, config: ObjectStoreConfig): IDBObjectStore {
  const options: IDBObjectStoreParameters = {}
  if (config.keyPath) {
    options.keyPath = config.keyPath
  }
  if (config.autoIncrement !== undefined) {
    options.autoIncrement = config.autoIncrement
  }

  const store = db.createObjectStore(config.name, options)

  // Create indexes
  if (config.indexes) {
    config.indexes.forEach((indexConfig) => {
      store.createIndex(indexConfig.name, indexConfig.keyPath, {
        unique: indexConfig.unique || false,
      })
    })
  }

  return store
}

/**
 * Generate composite key for file records
 * @param storageKey Storage key
 * @param path File path
 * @returns Composite key array
 */
export function createFileKey(storageKey: string, path: string): [string, string] {
  return [storageKey, path]
}
