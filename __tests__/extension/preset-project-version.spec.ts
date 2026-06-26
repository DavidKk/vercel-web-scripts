import {
  buildPresetProjectVersionStorageKeys,
  fetchPresetProjectVersionFromManifest,
  resolvePresetProjectVersion,
  writePresetProjectVersionToStorage,
} from '@ext/shared/extension-storage/preset-project-version'

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
      },
    },
  } as unknown as typeof chrome
  return store
}

describe('preset-project-version', () => {
  beforeEach(() => {
    mockChromeStorageLocal()
  })
  it('should build scoped GM storage keys for preset version lookup', () => {
    expect(
      buildPresetProjectVersionStorageKeys(
        {
          baseUrl: 'https://example.com',
          scriptKey: 'abc123',
          developMode: false,
        },
        '701d358d'
      )
    ).toEqual([
      'vws_gm_701d358d_vws_preset_project_version:https%3A%2F%2Fexample.com%7Cabc123',
      'vws_gm_vws_preset_project_version:https%3A%2F%2Fexample.com%7Cabc123',
      'vws_gm_vws_preset_project_version',
    ])
  })

  it('should fetch projectVersion from module-manifest.json', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectVersion: '1.2.3' }),
    })
    global.fetch = fetchMock as typeof fetch

    await expect(
      fetchPresetProjectVersionFromManifest({
        baseUrl: 'https://example.com/',
        scriptKey: 'abc123',
        developMode: false,
      })
    ).resolves.toBe('1.2.3')

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/static/abc123/module-manifest.json', expect.objectContaining({ cache: 'no-store' }))
  })

  it('should resolve from storage before manifest fetch', async () => {
    const store = mockChromeStorageLocal()
    const storageKey = buildPresetProjectVersionStorageKeys({ baseUrl: 'https://example.com', scriptKey: 'abc123', developMode: false }, '701d358d')[0]
    store.set(storageKey!, '9.9.9')

    const fetchMock = jest.fn()
    global.fetch = fetchMock as typeof fetch

    await expect(resolvePresetProjectVersion({ baseUrl: 'https://example.com', scriptKey: 'abc123', developMode: false }, '701d358d')).resolves.toBe('9.9.9')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should fall back to manifest and cache when storage is empty', async () => {
    const store = mockChromeStorageLocal()
    const config = { baseUrl: 'https://example.com', scriptKey: 'abc123', developMode: false }
    const storageKey = buildPresetProjectVersionStorageKeys(config, '701d358d')[0]

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projectVersion: '0.1.0' }),
    }) as typeof fetch

    await expect(resolvePresetProjectVersion(config, '701d358d')).resolves.toBe('0.1.0')

    expect(store.get(storageKey!)).toBe('0.1.0')
  })

  it('should skip manifest fetch when allowManifestFetch is false', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as typeof fetch

    await expect(
      resolvePresetProjectVersion({ baseUrl: 'https://example.com', scriptKey: 'abc123', developMode: false }, undefined, { allowManifestFetch: false })
    ).resolves.toBeNull()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('should write preset version to primary storage key', async () => {
    const store = mockChromeStorageLocal()
    const config = { baseUrl: 'https://example.com', scriptKey: 'abc123', developMode: false }
    const storageKey = buildPresetProjectVersionStorageKeys(config, 'scope1')[0]

    await writePresetProjectVersionToStorage(config, 'scope1', ' 2.0.0 ')

    expect(store.get(storageKey!)).toBe('2.0.0')
  })
})
