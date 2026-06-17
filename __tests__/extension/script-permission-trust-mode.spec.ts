import { scriptKeyListCacheStorageKey } from '@ext/shared/extension-multi-service-pure'
import { SCRIPT_PERMISSION_HISTORY_KEY } from '@ext/shared/extension-storage/script-permission-history'
import { SCRIPT_PERMISSION_REGISTRY_KEY } from '@ext/shared/extension-storage/script-permission-registry'
import { SCRIPT_PERMISSION_SESSION_KEY } from '@ext/shared/extension-storage/script-permission-session'
import { invalidateExtensionServicesStateCache } from '@ext/shared/extension-storage/services-state'
import { clearAllScriptPermissions, ensureScriptPermissionForTab, listAllowedPermissionKeysForTab } from '@ext/shell/permission-manager'
import { SERVICES_MIGRATION_FLAG_KEY, SERVICES_STORAGE_KEY } from '@ext/types'
import { buildScriptPermissionRegistryKey } from '@shared/script-permission'

function mockChromeStorageForTrust(): Map<string, unknown> {
  const localStore = new Map<string, unknown>([
    [SERVICES_STORAGE_KEY, { services: [], scriptKeyMeta: [{ scriptKey: 'key-a', gmScope: 'A', permissionMode: 'trust' }] }],
    [SERVICES_MIGRATION_FLAG_KEY, 1],
    [SCRIPT_PERMISSION_REGISTRY_KEY, { version: 1, entries: {} }],
    [SCRIPT_PERMISSION_HISTORY_KEY, { version: 1, entries: [] }],
  ])
  const sessionStore = new Map<string, unknown>()
  global.chrome = {
    storage: {
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
      },
    },
    runtime: {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    },
    tabs: {
      get: jest.fn(),
    },
  } as unknown as typeof chrome
  return localStore
}

describe('permission-manager trust mode', () => {
  const tabId = 7
  let localStore: Map<string, unknown>
  const request = {
    scriptKey: 'key-a',
    file: 'demo.ts',
    capability: 'unsafe-window' as const,
    resource: '*',
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    invalidateExtensionServicesStateCache()
    localStore = mockChromeStorageForTrust()
    await clearAllScriptPermissions()
  })

  it('should auto-allow without prompt and record persistent registry entry', async () => {
    const allowed = await ensureScriptPermissionForTab(tabId, request)

    expect(allowed).toBe(true)
    const registry = (await chrome.storage.local.get(SCRIPT_PERMISSION_REGISTRY_KEY))[SCRIPT_PERMISSION_REGISTRY_KEY] as {
      entries: Record<string, { decision: string; adminPolicy?: string }>
    }
    const key = buildScriptPermissionRegistryKey('key-a', 'demo.ts', 'unsafe-window', '*')
    expect(registry.entries[key]?.decision).toBe('allow')
    expect(registry.entries[key]?.adminPolicy).toBe('allow')
    const session = (await chrome.storage.session.get(SCRIPT_PERMISSION_SESSION_KEY))[SCRIPT_PERMISSION_SESSION_KEY] as {
      allow: Record<string, string[]>
    }
    expect(session.allow[String(tabId)]).toContain(key)
  })

  it('should include trust tier-1 keys in page bootstrap allow snapshot', async () => {
    localStore.set(SERVICES_STORAGE_KEY, {
      services: [
        {
          id: 'svc-1',
          label: 'Local',
          baseUrl: 'http://localhost:3000',
          scriptKey: 'key-a',
          enabled: true,
          developMode: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      scriptKeyMeta: [{ scriptKey: 'key-a', gmScope: 'A', permissionMode: 'trust' }],
    })
    localStore.set(scriptKeyListCacheStorageKey('key-a'), {
      scope: 'http://localhost:3000|key-a',
      gistUpdatedAt: Date.now(),
      metaSchema: 2,
      scripts: [{ file: 'shopline-debug.ts', name: 'shopline-debug', contentHash: 'abc' }],
    })
    invalidateExtensionServicesStateCache()

    const keys = await listAllowedPermissionKeysForTab(tabId)
    const unsafeKey = buildScriptPermissionRegistryKey('key-a', 'shopline-debug.ts', 'unsafe-window', '*')
    expect(keys).toContain(unsafeKey)
  })
})
