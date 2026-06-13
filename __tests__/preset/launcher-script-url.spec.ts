import { SCRIPT_BUNDLE_URL_KEY } from '../../preset/src/constants'
import {
  buildDefaultRemoteScriptUrl,
  getLauncherBootstrapCacheScope,
  parseStaticKeyFromScriptUrl,
  readHostScriptUrl,
  readLauncherBaseUrl,
  readScriptUrlFromGmStorage,
  resolveLauncherScriptUrl,
  shortUrlLabel,
} from '../../preset/src/helpers/launcher-script-url'

describe('launcher-script-url', () => {
  const base = 'http://localhost:3000'
  const key = '701d358ddd5420fb9d99a1e7a439b3e6082cf21c61d3dd69b8afd1d15bb63b0c'
  const legacyUrl = `${base}/static/${key}/tampermonkey-remote.js`
  const versionedUrl = `${base}/static/${key}/c47636cc515e90e5e8a73a3f0cf52263b643faa0/tampermonkey-remote.js`

  beforeEach(() => {
    ;(globalThis as Record<string, unknown>).__SCRIPT_URL__ = undefined
    ;(globalThis as Record<string, unknown>).__BASE_URL__ = undefined
    ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = undefined
    ;(globalThis as Record<string, unknown>).__GLOBAL__ = undefined
    const gm = globalThis as Record<string, unknown> & {
      GM_getValue?: (key: string, defaultValue?: unknown) => unknown
      GM_setValue?: (key: string, value: unknown) => void
    }
    delete gm.GM_getValue
    delete gm.GM_setValue
  })

  it('parseStaticKeyFromScriptUrl accepts legacy and versioned remote URLs', () => {
    expect(parseStaticKeyFromScriptUrl(legacyUrl)).toBe(key)
    expect(parseStaticKeyFromScriptUrl(versionedUrl)).toBe(key)
  })

  it('resolveLauncherScriptUrl falls back to host globals', () => {
    ;(globalThis as Record<string, unknown>).__SCRIPT_URL__ = versionedUrl
    expect(resolveLauncherScriptUrl()).toBe(versionedUrl)
    expect(readHostScriptUrl()).toBe(versionedUrl)
  })

  it('resolveLauncherScriptUrl builds default URL from base + script key', () => {
    ;(globalThis as Record<string, unknown>).__BASE_URL__ = base
    ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = key
    expect(buildDefaultRemoteScriptUrl()).toBe(legacyUrl)
    expect(resolveLauncherScriptUrl()).toBe(legacyUrl)
  })

  it('getLauncherBootstrapCacheScope encodes base|key without resolveLauncherScriptUrl recursion', () => {
    ;(globalThis as Record<string, unknown>).__BASE_URL__ = base
    ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = key
    expect(getLauncherBootstrapCacheScope()).toBe(encodeURIComponent(`${base}|${key}`))
    expect(() => resolveLauncherScriptUrl()).not.toThrow()
    expect(resolveLauncherScriptUrl()).toBe(legacyUrl)
  })

  it('readScriptUrlFromGmStorage returns scoped script-bundle URL from GM storage', () => {
    const scope = encodeURIComponent(`${base}|${key}`)
    const store: Record<string, unknown> = {
      [`${SCRIPT_BUNDLE_URL_KEY}:${scope}`]: versionedUrl,
    }
    ;(globalThis as Record<string, unknown>).__BASE_URL__ = base
    ;(globalThis as Record<string, unknown>).__VWS_SCRIPT_KEY__ = key
    ;(globalThis as Record<string, unknown>).GM_getValue = (storageKey: string, defaultValue?: unknown) => (storageKey in store ? store[storageKey] : defaultValue)
    expect(readScriptUrlFromGmStorage()).toBe(versionedUrl)
    expect(resolveLauncherScriptUrl()).toBe(versionedUrl)
  })

  it('readLauncherBaseUrl derives origin from host __SCRIPT_URL__ when __BASE_URL__ is unset', () => {
    ;(globalThis as Record<string, unknown>).__GLOBAL__ = {
      __SCRIPT_URL__: versionedUrl,
    }
    expect(readLauncherBaseUrl()).toBe(base)
  })

  it('shortUrlLabel keeps preset-ui.js suffix when truncating', () => {
    const presetUiUrl = `${base}/static/${key}/a6fe51e10d08cde745c94ea25438a2f9eadf0257/preset-ui.js`
    expect(shortUrlLabel(presetUiUrl, 60)).toBe('.../a6fe51e10d08cde745c94ea25438a2f9eadf0257/preset-ui.js')
  })
})
