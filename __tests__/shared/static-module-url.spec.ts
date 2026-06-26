import { extractStaticModuleHash, isStaticModuleCacheStale } from '@shared/static-module-url'

describe('extractStaticModuleHash', () => {
  it('should return SHA-1 segment from preset-ui static URL', () => {
    const url = 'https://example.com/static/key/6271136495bf5c8f88d503fc8cdbcfb47612cfe8/preset-ui.js'
    expect(extractStaticModuleHash(url, 'preset-ui.js')).toBe('6271136495bf5c8f88d503fc8cdbcfb47612cfe8')
  })

  it('should return null when module file does not match', () => {
    const url = 'https://example.com/static/key/6271136495bf5c8f88d503fc8cdbcfb47612cfe8/preset.js'
    expect(extractStaticModuleHash(url, 'preset-ui.js')).toBeNull()
  })
})

describe('isStaticModuleCacheStale', () => {
  it('should detect hash mismatch between cached and manifest URLs', () => {
    const cached = 'https://example.com/static/key/077a36e6d3010c6c1f6a608e6cb090bd59704c24/preset-ui.js'
    const manifest = 'https://example.com/static/key/6271136495bf5c8f88d503fc8cdbcfb47612cfe8/preset-ui.js'
    expect(isStaticModuleCacheStale(cached, manifest, 'preset-ui.js')).toBe(true)
  })

  it('should return false when hashes match', () => {
    const url = 'https://example.com/static/key/6271136495bf5c8f88d503fc8cdbcfb47612cfe8/preset-ui.js'
    expect(isStaticModuleCacheStale(url, url, 'preset-ui.js')).toBe(false)
  })
})
