import { countCompiledRemoteModules, formatCacheInventory, parseRulesCacheStats, shortCacheLabel } from '@shared/cache-debug'

describe('cache-debug', () => {
  it('counts compiled module markers in remote bundle', () => {
    const content = `
      // shopline-debug.js
      ;(function(){})()
      // table-copy-csv.ts
      ;(function(){})()
    `
    expect(countCompiledRemoteModules(content)).toBe(2)
  })

  it('parses rules cache stats', () => {
    const stats = parseRulesCacheStats(
      JSON.stringify([
        { script: 'a.js', wildcard: 'https://*/*' },
        { script: 'b.js', wildcard: 'https://example.com/*' },
        { script: 'a.js', wildcard: 'https://other.com/*' },
      ])
    )
    expect(stats.ruleCount).toBe(3)
    expect(stats.scriptCount).toBe(2)
    expect(stats.scriptNames).toEqual(['a.js', 'b.js'])
  })

  it('formats inventory line', () => {
    expect(formatCacheInventory({ presetBytes: 100, scripts: 2 })).toBe('presetBytes=100 scripts=2')
  })

  it('shortens cache labels', () => {
    expect(shortCacheLabel('abcdef1234567890abcdef')).toBe('abcdef1234567890...')
  })
})
