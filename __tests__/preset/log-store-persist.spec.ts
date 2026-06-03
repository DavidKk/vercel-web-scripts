import type { LogStoreConfig } from '../../preset/src/services/log-store/config'
import { LogStore } from '../../preset/src/services/log-store/LogStore'

function makeConfig(overrides: Partial<LogStoreConfig> = {}): LogStoreConfig {
  return {
    dbName: 'mm_logs_test',
    dbVersion: 1,
    storeName: 'entries',
    storageKey: 'buffer',
    maxEntries: 100,
    retentionDays: 7,
    persistDebounceMs: 300,
    persistToIndexedDB: false,
    ...overrides,
  }
}

describe('LogStore persistence flag', () => {
  it('isPersistenceEnabled reflects config', () => {
    const off = new LogStore(makeConfig({ persistToIndexedDB: false }))
    const on = new LogStore(makeConfig({ persistToIndexedDB: true }))
    expect(off.isPersistenceEnabled()).toBe(false)
    expect(on.isPersistenceEnabled()).toBe(true)
  })

  it('setPersistenceEnabled updates flag', () => {
    const store = new LogStore(makeConfig({ persistToIndexedDB: false }))
    store.setPersistenceEnabled(true)
    expect(store.isPersistenceEnabled()).toBe(true)
    store.setPersistenceEnabled(false)
    expect(store.isPersistenceEnabled()).toBe(false)
  })

  it('push keeps entries in memory when persistence is off', () => {
    const store = new LogStore(makeConfig({ persistToIndexedDB: false }))
    store.push('info', 'hello')
    expect(store.getLogs('current')).toHaveLength(1)
    expect(store.getLogs('all')).toHaveLength(1)
  })
})
