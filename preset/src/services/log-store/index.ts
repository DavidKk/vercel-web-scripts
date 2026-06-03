/**
 * Log store module: config, types, class, and default instance.
 * Import logStore from here for production; use LogStore + config in tests.
 */

import { normalizeShellLogOutputMode, SHELL_LOG_OUTPUT_MODE_KEY } from '@shared/shell-log-output'

import { isLogPersistEnabled, shouldLogToMemory } from '@/services/shell-log-settings'

import { flushBootLogBufferIntoStore } from './boot-buffer'
import { defaultLogStoreConfig } from './config'
import { LogStore } from './LogStore'

const logStore = new LogStore({
  ...defaultLogStoreConfig,
  persistToIndexedDB: isLogPersistEnabled(),
})
if (shouldLogToMemory()) {
  flushBootLogBufferIntoStore(logStore)
}

if (typeof GM_addValueChangeListener === 'function') {
  GM_addValueChangeListener(SHELL_LOG_OUTPUT_MODE_KEY, (_name, _oldValue, newValue) => {
    if (normalizeShellLogOutputMode(newValue) === 'none') {
      logStore.clearLogs()
    }
  })
}

if (typeof window !== 'undefined') {
  if (logStore.isPersistenceEnabled()) {
    logStore.loadFromIDB()
  } else {
    void logStore.purgePersistedStorage()
  }
}

export type { VwsBootLogRecord } from './boot-buffer'
export { flushBootLogBufferIntoStore, VWS_BOOT_LOG_GLOBAL_KEY } from './boot-buffer'
export type { LogStoreConfig } from './config'
export { defaultLogStoreConfig } from './config'
export { LogStore } from './LogStore'
export type { LogEntry, LogLevel, LogScope, LogStoreListener } from './types'
export { logStore }
