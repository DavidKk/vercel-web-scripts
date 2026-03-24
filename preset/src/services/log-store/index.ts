/**
 * Log store module: config, types, class, and default instance.
 * Import logStore from here for production; use LogStore + config in tests.
 */

import { flushBootLogBufferIntoStore } from './boot-buffer'
import { defaultLogStoreConfig } from './config'
import { LogStore } from './LogStore'

const logStore = new LogStore(defaultLogStoreConfig)
flushBootLogBufferIntoStore(logStore)

if (typeof window !== 'undefined') {
  logStore.loadFromIDB()
}

export type { VwsBootLogRecord } from './boot-buffer'
export { flushBootLogBufferIntoStore, VWS_BOOT_LOG_GLOBAL_KEY } from './boot-buffer'
export type { LogStoreConfig } from './config'
export { defaultLogStoreConfig } from './config'
export { LogStore } from './LogStore'
export type { LogEntry, LogLevel, LogScope, LogStoreListener } from './types'
export { logStore }
