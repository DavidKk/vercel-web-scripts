/**
 * Log store module: config, types, class, and default instance.
 * Import logStore from here for production; use LogStore + config in tests.
 */

export type { LogStoreConfig } from './config'
export { defaultLogStoreConfig } from './config'
export { LogStore } from './LogStore'
export type { LogEntry, LogLevel, LogStoreListener } from './types'

import { defaultLogStoreConfig } from './config'
import { LogStore } from './LogStore'

const logStore = new LogStore(defaultLogStoreConfig)

if (typeof window !== 'undefined') {
  logStore.loadFromIDB()
}

export { logStore }
