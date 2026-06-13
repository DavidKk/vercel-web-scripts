import { SHELL_NETWORK_ENABLED_KEY } from '../../shared/launcher-constants'
import { clearAllRuntimeGmCaches, isRuntimeCacheGmKey, listRuntimeCacheGmKeys, RULE_CACHE_KEY } from '../../shared/runtime-cache-clear'

describe('runtime-cache-clear', () => {
  it('isRuntimeCacheGmKey matches vws_, #Rule, and script-update host', () => {
    expect(isRuntimeCacheGmKey('vws_preset_cache')).toBe(true)
    expect(isRuntimeCacheGmKey('vws_optional_ui:scope:content')).toBe(true)
    expect(isRuntimeCacheGmKey(RULE_CACHE_KEY)).toBe(true)
    expect(isRuntimeCacheGmKey('script-update@host')).toBe(true)
    expect(isRuntimeCacheGmKey(SHELL_NETWORK_ENABLED_KEY)).toBe(false)
    expect(isRuntimeCacheGmKey('files@web-script-editor-dev')).toBe(false)
  })

  it('listRuntimeCacheGmKeys filters preserve keys', () => {
    const keys = ['vws_preset_cache', RULE_CACHE_KEY, SHELL_NETWORK_ENABLED_KEY, 'files@web-script-dev']
    expect(listRuntimeCacheGmKeys(keys)).toEqual(['vws_preset_cache', RULE_CACHE_KEY])
  })

  it('clearAllRuntimeGmCaches removes caches and restores shell prefs', () => {
    const store = new Map<string, unknown>([
      ['vws_preset_cache', 'body'],
      [RULE_CACHE_KEY, '[]'],
      [SHELL_NETWORK_ENABLED_KEY, false],
    ])
    const gm = {
      listValues: () => [...store.keys()],
      getValue: (key: string) => store.get(key),
      deleteValue: (key: string) => {
        store.delete(key)
      },
      setValue: (key: string, value: unknown) => {
        store.set(key, value)
      },
    }
    const removed = clearAllRuntimeGmCaches(gm)
    expect(removed).toBe(2)
    expect(store.has('vws_preset_cache')).toBe(false)
    expect(store.has(RULE_CACHE_KEY)).toBe(false)
    expect(store.get(SHELL_NETWORK_ENABLED_KEY)).toBe(false)
  })
})
