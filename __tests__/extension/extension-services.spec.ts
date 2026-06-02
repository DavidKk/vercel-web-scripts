import {
  countServiceRefs,
  defaultGmScopeFromLabel,
  defaultLabelFromBaseUrl,
  ensureUniqueGmScope,
  findServiceByEndpoint,
  formatScriptKeyMasked,
  getEnabledScriptKeys,
  getGmScopeForScriptKey,
  isValidScriptKeyFormat,
  normalizeBaseUrl,
  resolveDevelopService,
  resolveGmScopeSeedLabel,
  resolveOtaEndpoint,
  serviceEndpointKey,
} from '../../extension/src/shared/extension-services'
import type { ServiceProfile } from '../../extension/src/types'

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

describe('extension-services', () => {
  describe('normalizeBaseUrl', () => {
    it('should strip trailing slashes', () => {
      expect(normalizeBaseUrl('https://app.example.com/')).toBe('https://app.example.com')
    })
  })

  describe('serviceEndpointKey', () => {
    it('should normalize endpoint identity', () => {
      expect(serviceEndpointKey('https://a.com/', ' abc ')).toBe('https://a.com|abc')
    })
  })

  describe('getEnabledScriptKeys', () => {
    it('should return unique enabled scriptKeys in list order', () => {
      const services = [
        makeService({ id: '1', baseUrl: 'https://a.com', scriptKey: 'key-a', enabled: true }),
        makeService({ id: '2', baseUrl: 'https://b.com', scriptKey: 'key-a', enabled: true }),
        makeService({ id: '3', baseUrl: 'https://c.com', scriptKey: 'key-b', enabled: false }),
        makeService({ id: '4', baseUrl: 'https://d.com', scriptKey: 'key-c', enabled: true }),
      ]
      expect(getEnabledScriptKeys(services)).toEqual(['key-a', 'key-c'])
    })
  })

  describe('resolveOtaEndpoint', () => {
    it('should pick first enabled service for scriptKey', () => {
      const services = [
        makeService({ id: '1', baseUrl: 'https://prod.com', scriptKey: 'abc', enabled: true }),
        makeService({ id: '2', baseUrl: 'https://local.com', scriptKey: 'abc', enabled: true }),
      ]
      const resolved = resolveOtaEndpoint('abc', services)
      expect(resolved?.baseUrl).toBe('https://prod.com')
    })

    it('should skip disabled services', () => {
      const services = [
        makeService({ id: '1', baseUrl: 'https://prod.com', scriptKey: 'abc', enabled: false }),
        makeService({ id: '2', baseUrl: 'https://local.com', scriptKey: 'abc', enabled: true }),
      ]
      expect(resolveOtaEndpoint('abc', services)?.baseUrl).toBe('https://local.com')
    })
  })

  describe('resolveDevelopService', () => {
    it('should pick first enabled developMode service', () => {
      const services = [
        makeService({ id: '1', baseUrl: 'https://prod.com', scriptKey: 'abc', enabled: true, developMode: false }),
        makeService({ id: '2', baseUrl: 'https://local.com', scriptKey: 'abc', enabled: true, developMode: true }),
      ]
      expect(resolveDevelopService(services)?.baseUrl).toBe('https://local.com')
    })

    it('should return null when no develop service qualifies', () => {
      const services = [makeService({ id: '1', baseUrl: 'https://prod.com', scriptKey: 'abc', enabled: true, developMode: false })]
      expect(resolveDevelopService(services)).toBeNull()
    })
  })

  describe('findServiceByEndpoint', () => {
    it('should find duplicate endpoint', () => {
      const services = [makeService({ id: '1', baseUrl: 'https://a.com/', scriptKey: ' k ', enabled: true })]
      expect(findServiceByEndpoint(services, 'https://a.com', 'k')?.id).toBe('1')
    })
  })

  describe('countServiceRefs', () => {
    it('should count services sharing scriptKey', () => {
      const services = [
        makeService({ id: '1', baseUrl: 'https://a.com', scriptKey: 'x', enabled: true }),
        makeService({ id: '2', baseUrl: 'https://b.com', scriptKey: 'x', enabled: true }),
        makeService({ id: '3', baseUrl: 'https://c.com', scriptKey: 'y', enabled: true }),
      ]
      expect(countServiceRefs('x', services)).toBe(2)
    })
  })

  describe('gmScope helpers', () => {
    it('should sanitize default gmScope from label', () => {
      expect(defaultGmScopeFromLabel('Client A')).toBe('Client_A')
    })

    it('should uniquify gmScope collisions', () => {
      const scope = ensureUniqueGmScope('A', 'key-b', [{ scriptKey: 'key-a', gmScope: 'A' }])
      expect(scope).toBe('A_2')
    })
  })

  describe('defaultLabelFromBaseUrl', () => {
    it('should include port for local dev hosts', () => {
      expect(defaultLabelFromBaseUrl('http://localhost:3000')).toBe('localhost:3000')
      expect(defaultLabelFromBaseUrl('http://127.0.0.1:5173')).toBe('localhost:5173')
    })

    it('should use hostname for remote hosts', () => {
      expect(defaultLabelFromBaseUrl('https://vercel-web-scripts.vercel.app')).toBe('vercel-web-scripts.vercel.app')
    })
  })

  describe('resolveGmScopeSeedLabel', () => {
    it('should prefer explicit label over baseUrl', () => {
      expect(resolveGmScopeSeedLabel('Client A', 'http://localhost:3000')).toBe('Client A')
    })

    it('should fall back to baseUrl label when service label is empty', () => {
      expect(resolveGmScopeSeedLabel('', 'https://vercel-web-scripts.vercel.app')).toBe('vercel-web-scripts.vercel.app')
    })
  })

  describe('getGmScopeForScriptKey', () => {
    it('should derive distinct gmScope defaults for different local ports', () => {
      expect(getGmScopeForScriptKey('key-a', [], '', 'http://localhost:3000')).toBe('localhost_3000')
      expect(getGmScopeForScriptKey('key-b', [{ scriptKey: 'key-a', gmScope: 'localhost_3000' }], '', 'http://localhost:5173')).toBe('localhost_5173')
    })
  })

  describe('formatScriptKeyMasked', () => {
    it('should mask long script keys with head and tail visible', () => {
      const key = 'a'.repeat(64)
      expect(formatScriptKeyMasked(key)).toBe(`${'a'.repeat(8)}${'*'.repeat(48)}${'a'.repeat(8)}`)
    })

    it('should return short keys unchanged', () => {
      expect(formatScriptKeyMasked('abc123')).toBe('abc123')
    })
  })

  describe('isValidScriptKeyFormat', () => {
    it('should accept 64-char hex script keys', () => {
      expect(isValidScriptKeyFormat('a'.repeat(64))).toBe(true)
    })

    it('should reject short or non-hex keys', () => {
      expect(isValidScriptKeyFormat('abc')).toBe(false)
      expect(isValidScriptKeyFormat('g'.repeat(64))).toBe(false)
    })
  })
})
