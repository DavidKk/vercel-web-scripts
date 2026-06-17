import { GM_STORAGE_PREFIX } from '@ext/shared/extension-storage/constants'
import { clearAllRuntimeCachesForEnabledScriptKeys } from '@ext/shared/extension-storage/runtime-cache'
import { SCRIPT_PERMISSION_HISTORY_KEY } from '@ext/shared/extension-storage/script-permission-history'
import { SCRIPT_PERMISSION_REGISTRY_KEY } from '@ext/shared/extension-storage/script-permission-registry'
import { SERVICES_STORAGE_KEY } from '@ext/types'
import { PRESET_CACHE_KEY } from '@shared/launcher-constants'

function mockChromeStorageLocal(): Map<string, unknown> {
  const store = new Map<string, unknown>()
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (keys: string | string[] | null) => {
          if (keys === null) {
            return Object.fromEntries(store)
          }
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, unknown> = {}
          for (const key of list) {
            if (store.has(key)) {
              out[key] = store.get(key)
            }
          }
          return out
        }),
        set: jest.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            store.set(key, value)
          }
        }),
        remove: jest.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const key of list) {
            store.delete(key)
          }
        }),
      },
    },
  } as unknown as typeof chrome
  return store
}

describe('runtime-cache permissions', () => {
  it('should preserve script permission registry and history on update runtime', async () => {
    const store = mockChromeStorageLocal()
    store.set(SERVICES_STORAGE_KEY, { version: 1, services: [] })
    store.set(SCRIPT_PERMISSION_REGISTRY_KEY, { version: 1, entries: { 'key:demo.ts:network:example.com': { decision: 'allow', remember: 'persistent', updatedAt: 1 } } })
    store.set(SCRIPT_PERMISSION_HISTORY_KEY, {
      version: 1,
      entries: [
        {
          id: 'h1',
          tabId: 1,
          key: 'key:demo.ts:network:example.com',
          request: { scriptKey: 'key', file: 'demo.ts', capability: 'network', resource: 'example.com' },
          decision: 'allow',
          remember: 'once',
          decidedAt: 1,
        },
      ],
    })
    store.set(`${GM_STORAGE_PREFIX}${PRESET_CACHE_KEY}`, 'cached-body')
    store.set('vws_preset_etag', 'etag')

    await clearAllRuntimeCachesForEnabledScriptKeys()

    expect(store.has(SCRIPT_PERMISSION_REGISTRY_KEY)).toBe(true)
    expect(store.has(SCRIPT_PERMISSION_HISTORY_KEY)).toBe(true)
    expect(store.has(`${GM_STORAGE_PREFIX}${PRESET_CACHE_KEY}`)).toBe(false)
    expect(store.has('vws_preset_etag')).toBe(false)
  })
})
