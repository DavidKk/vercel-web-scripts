import {
  appendScriptPermissionHistoryEntries,
  listOncePermissionHistoryRows,
  listPermissionHistoryRows,
  MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES,
  readScriptPermissionHistory,
  SCRIPT_PERMISSION_HISTORY_KEY,
} from '@ext/shared/extension-storage/script-permission-history'
import type { ScriptPermissionRequest } from '@shared/script-permission'

const sampleRequest: ScriptPermissionRequest = {
  scriptKey: 'key-a',
  file: 'demo.ts',
  capability: 'network',
  resource: 'example.com',
}

function mockChromeStorageLocal(): void {
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
}

describe('script-permission-history', () => {
  beforeEach(async () => {
    mockChromeStorageLocal()
    await chrome.storage.local.remove(SCRIPT_PERMISSION_HISTORY_KEY)
  })

  it('lists all history rows newest-first', async () => {
    await appendScriptPermissionHistoryEntries([
      {
        id: 'a',
        tabId: 1,
        key: 'k1',
        request: sampleRequest,
        decision: 'allow',
        remember: 'once',
        decidedAt: 100,
      },
      {
        id: 'b',
        tabId: 1,
        key: 'k2',
        request: sampleRequest,
        decision: 'deny',
        remember: 'session',
        decidedAt: 200,
      },
      {
        id: 'c',
        tabId: 2,
        key: 'k3',
        request: sampleRequest,
        decision: 'deny',
        remember: 'persistent',
        decidedAt: 150,
      },
    ])

    const history = await readScriptPermissionHistory()
    expect(listPermissionHistoryRows(history).map((row) => row.id)).toEqual(['b', 'c', 'a'])
    expect(listOncePermissionHistoryRows(history).map((row) => row.id)).toEqual(['a'])
  })

  it('trims history to MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES', async () => {
    const entries = Array.from({ length: MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES + 3 }, (_, index) => {
      const ordinal = MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES + 2 - index
      return {
        id: `id-${ordinal}`,
        tabId: 1,
        key: `k-${ordinal}`,
        request: sampleRequest,
        decision: 'deny' as const,
        remember: 'once' as const,
        decidedAt: ordinal,
      }
    })
    await appendScriptPermissionHistoryEntries(entries)
    const history = await readScriptPermissionHistory()
    expect(history.entries).toHaveLength(MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES)
    expect(history.entries[0]?.id).toBe(`id-${MAX_SCRIPT_PERMISSION_HISTORY_ENTRIES + 2}`)
  })
})
