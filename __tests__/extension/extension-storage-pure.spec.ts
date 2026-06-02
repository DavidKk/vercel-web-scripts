import {
  buildScriptKeyBootstrapEntriesFromState,
  buildScriptKeyGroupMetaFromState,
  parseScriptEnabledStorageKey,
  scriptEnabledStorageKey,
  scriptKeyListCacheStorageKey,
  scriptKeyRulesStorageKey,
} from '../../extension/src/shared/extension-multi-service-pure'
import { getGmScopeForScriptKey } from '../../extension/src/shared/extension-services'
import type { ExtensionServicesState, ServiceProfile } from '../../extension/src/types'

function makeService(partial: Partial<ServiceProfile> & Pick<ServiceProfile, 'id' | 'baseUrl' | 'scriptKey'>): ServiceProfile {
  const now = Date.now()
  return {
    label: partial.label ?? 'svc',
    enabled: partial.enabled ?? true,
    developMode: partial.developMode,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

describe('extension-storage pure helpers', () => {
  describe('storage key helpers', () => {
    it('should build scriptKey-scoped storage keys', () => {
      expect(scriptKeyRulesStorageKey('abc')).toBe('vws_scriptkey_rules:abc')
      expect(scriptKeyListCacheStorageKey('abc')).toBe('vws_scriptkey_script_list_cache:abc')
      expect(scriptEnabledStorageKey('abc', 'foo.js')).toBe('vws_script_enabled:abc:foo.js')
    })
  })

  describe('parseScriptEnabledStorageKey', () => {
    it('should parse scoped script enabled keys', () => {
      expect(parseScriptEnabledStorageKey('vws_script_enabled:key-a:demo.js')).toEqual({
        scriptKey: 'key-a',
        file: 'demo.js',
      })
    })

    it('should parse legacy unscoped keys', () => {
      expect(parseScriptEnabledStorageKey('vws_script_enabled:demo.js')).toEqual({
        scriptKey: null,
        file: 'demo.js',
      })
    })

    it('should reject invalid script filenames', () => {
      expect(parseScriptEnabledStorageKey('vws_script_enabled:key-a:not-a-script')).toBeNull()
    })
  })

  describe('buildScriptKeyGroupMetaFromState', () => {
    it('should dedupe scriptKeys and mark inactive groups when all services disabled', () => {
      const state: ExtensionServicesState = {
        services: [
          makeService({ id: '1', label: 'Prod', baseUrl: 'https://prod.com', scriptKey: 'key-a', enabled: false }),
          makeService({ id: '2', label: 'Local', baseUrl: 'https://local.com', scriptKey: 'key-a', enabled: false }),
          makeService({ id: '3', label: 'Other', baseUrl: 'https://other.com', scriptKey: 'key-b', enabled: true }),
        ],
        scriptKeyMeta: [],
      }

      const groups = buildScriptKeyGroupMetaFromState(state)
      expect(groups.map((g) => g.scriptKey)).toEqual(['key-a', 'key-b'])
      expect(groups[0]?.active).toBe(false)
      expect(groups[0]?.serviceLabels).toEqual(['Prod', 'Local'])
      expect(groups[0]?.primaryServiceLabel).toBe('Prod')
      expect(groups[1]?.editorBaseUrl).toBe('https://other.com')
    })

    it('should pick primaryServiceLabel from first enabled service in list order', () => {
      const state: ExtensionServicesState = {
        services: [
          makeService({ id: '1', label: 'Prod', baseUrl: 'https://prod.com', scriptKey: 'key-a', enabled: true }),
          makeService({ id: '2', label: 'Local', baseUrl: 'https://local.com', scriptKey: 'key-a', enabled: true }),
        ],
        scriptKeyMeta: [],
      }

      const groups = buildScriptKeyGroupMetaFromState(state)
      expect(groups[0]?.primaryServiceLabel).toBe('Prod')
      expect(groups[0]?.editorBaseUrl).toBe('https://prod.com')
    })
  })

  describe('buildScriptKeyBootstrapEntriesFromState', () => {
    it('should build one bootstrap entry per enabled scriptKey using OTA representative', () => {
      const state: ExtensionServicesState = {
        services: [
          makeService({ id: '1', label: 'A', baseUrl: 'https://prod.com', scriptKey: 'key-a', enabled: true }),
          makeService({ id: '2', label: 'B', baseUrl: 'https://local.com', scriptKey: 'key-a', enabled: true }),
          makeService({ id: '3', label: 'C', baseUrl: 'https://other.com', scriptKey: 'key-b', enabled: true }),
        ],
        scriptKeyMeta: [{ scriptKey: 'key-b', gmScope: 'PkgB' }],
      }

      const entries = buildScriptKeyBootstrapEntriesFromState(state, {
        'key-a': { files: ['a.js'], enabledByFile: { 'a.js': true } },
        'key-b': { files: ['b.ts'], enabledByFile: { 'b.ts': false } },
      })

      expect(entries).toHaveLength(2)
      expect(entries[0]?.baseUrl).toBe('https://prod.com')
      expect(entries[0]?.enabledScripts).toEqual({ 'a.js': true })
      expect(entries[1]?.gmScope).toBe('PkgB')
      expect(entries[1]?.enabledScripts).toEqual({ 'b.ts': false })
    })
  })

  describe('getGmScopeForScriptKey', () => {
    it('should default gmScope from service label when meta missing', () => {
      expect(getGmScopeForScriptKey('key-a', [], 'Client A')).toBe('Client_A')
    })
  })
})
