import {
  applyScriptPermissionSessionSnapshot,
  readScriptPermissionSessionSnapshot,
  SCRIPT_PERMISSION_SESSION_KEY,
  snapshotFromSessionPermissionMaps,
  writeScriptPermissionSessionSnapshot,
} from '@ext/shared/extension-storage/script-permission-session'
import { clearSessionPermissionsForTab, hydrateScriptPermissionSession, listSessionPermissionEntries, seedSessionConnectAllows } from '@ext/shell/permission-manager'
import { SERVICES_MIGRATION_FLAG_KEY, SERVICES_STORAGE_KEY } from '@ext/types'
import { buildScriptPermissionRegistryKey } from '@shared/script-permission'

function mockChromeSessionStorage(): Map<string, unknown> {
  const sessionStore = new Map<string, unknown>()
  const localStore = new Map<string, unknown>([
    [SERVICES_STORAGE_KEY, { services: [], scriptKeyMeta: [] }],
    [SERVICES_MIGRATION_FLAG_KEY, 1],
  ])
  global.chrome = {
    storage: {
      session: {
        get: jest.fn(async (keys: string | string[] | null) => {
          if (keys === null) {
            return Object.fromEntries(sessionStore)
          }
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, unknown> = {}
          for (const key of list) {
            if (sessionStore.has(key)) {
              out[key] = sessionStore.get(key)
            }
          }
          return out
        }),
        set: jest.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            sessionStore.set(key, value)
          }
        }),
        remove: jest.fn(async (keys: string | string[]) => {
          const list = Array.isArray(keys) ? keys : [keys]
          for (const key of list) {
            sessionStore.delete(key)
          }
        }),
      },
      local: {
        get: jest.fn(async (keys: string | string[] | null) => {
          if (keys === null) {
            return Object.fromEntries(localStore)
          }
          const list = Array.isArray(keys) ? keys : [keys]
          const out: Record<string, unknown> = {}
          for (const key of list) {
            if (localStore.has(key)) {
              out[key] = localStore.get(key)
            }
          }
          return out
        }),
        set: jest.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            localStore.set(key, value)
          }
        }),
      },
    },
    runtime: {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    },
  } as unknown as typeof chrome
  return sessionStore
}

describe('script-permission-session storage', () => {
  beforeEach(() => {
    mockChromeSessionStorage()
  })

  it('round-trips session allow/deny maps', async () => {
    const allowByTab = new Map<number, Set<string>>([[42, new Set(['k1'])]])
    const denyByTab = new Map<number, Set<string>>([[42, new Set(['k2'])]])
    await writeScriptPermissionSessionSnapshot(snapshotFromSessionPermissionMaps(allowByTab, denyByTab))

    const restoredAllow = new Map<number, Set<string>>()
    const restoredDeny = new Map<number, Set<string>>()
    applyScriptPermissionSessionSnapshot(await readScriptPermissionSessionSnapshot(), restoredAllow, restoredDeny)

    expect([...restoredAllow.get(42)!]).toEqual(['k1'])
    expect([...restoredDeny.get(42)!]).toEqual(['k2'])
  })
})

describe('permission-manager session persistence', () => {
  const tabId = 42

  beforeEach(() => {
    mockChromeSessionStorage()
  })

  afterEach(async () => {
    clearSessionPermissionsForTab(tabId)
    await chrome.storage.session.remove(SCRIPT_PERMISSION_SESSION_KEY)
  })

  it('seeds exact hosts and * from @connect', async () => {
    const context = { scriptKey: 'key-a', file: 'demo.ts' }
    await seedSessionConnectAllows(tabId, context, ['Example.com', '*', '*.wildcard.com'])
    const keys = listSessionPermissionEntries()
      .filter((row) => row.tabId === tabId)
      .map((row) => row.key)
    expect(keys).toContain(buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'network', 'example.com'))
    expect(keys).toContain(buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'network', '*'))
    expect(keys).not.toContain(buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'network', '*.wildcard.com'))
  })

  it('restores session grants after hydrate (service worker restart)', async () => {
    const key = buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'network', 'api.example.com')
    await writeScriptPermissionSessionSnapshot({
      version: 1,
      allow: { [String(tabId)]: [key] },
      deny: {},
    })

    await hydrateScriptPermissionSession()

    const keys = listSessionPermissionEntries()
      .filter((row) => row.tabId === tabId)
      .map((row) => row.key)
    expect(keys).toContain(key)
  })
})
