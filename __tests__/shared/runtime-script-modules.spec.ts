import { filterScriptModulesByUrl, type RuntimeScriptModuleCatalogEntry, topoSortScriptModulesWithDeps } from '@shared/runtime-script-modules'
import { matchUrlPattern } from '@shared/url-pattern-match'

describe('matchUrlPattern', () => {
  it('should match wildcard @match patterns', () => {
    expect(matchUrlPattern('https://example.com/*', 'https://example.com/foo')).toBe(true)
    expect(matchUrlPattern('https://example.com/*', 'https://other.com/foo')).toBe(false)
  })
})

describe('filterScriptModulesByUrl', () => {
  const catalog: RuntimeScriptModuleCatalogEntry[] = [
    {
      file: 'a.ts',
      match: ['https://shop.example.com/*'],
      track: 'stable',
      url: 'https://cdn/a.js',
      hash: { algorithm: 'sha1', value: 'aaa' },
    },
    {
      file: 'b.ts',
      match: [],
      track: 'stable',
      url: 'https://cdn/b.js',
      hash: { algorithm: 'sha1', value: 'bbb' },
    },
  ]

  it('should include modules whose @match matches the page URL', () => {
    const matched = filterScriptModulesByUrl(catalog, 'https://shop.example.com/cart', [])
    expect(matched.map((m) => m.file)).toEqual(['a.ts'])
  })

  it('should include modules matched via RULE wildcard rows', () => {
    const matched = filterScriptModulesByUrl(catalog, 'https://admin.example.com/', [{ script: 'b.ts', wildcard: 'https://admin.example.com/*' }])
    expect(matched.map((m) => m.file)).toEqual(['b.ts'])
  })
})

describe('topoSortScriptModulesWithDeps', () => {
  const catalog: RuntimeScriptModuleCatalogEntry[] = [
    { file: 'base.ts', match: [], track: 'stable', url: '/base', hash: { algorithm: 'sha1', value: '1' } },
    { file: 'child.ts', match: [], track: 'stable', url: '/child', hash: { algorithm: 'sha1', value: '2' }, dependsOn: ['base.ts'] },
    { file: 'other.ts', match: [], track: 'stable', url: '/other', hash: { algorithm: 'sha1', value: '3' } },
  ]

  it('should order dependencies before dependents and auto-include missing deps', () => {
    const matched = catalog.filter((m) => m.file === 'child.ts')
    const ordered = topoSortScriptModulesWithDeps(matched, catalog)
    expect(ordered.map((m) => m.file)).toEqual(['base.ts', 'child.ts'])
  })

  it('should throw on circular dependsOn', () => {
    const cyclic: RuntimeScriptModuleCatalogEntry[] = [
      { file: 'x.ts', match: [], track: 'stable', url: '/x', hash: { algorithm: 'sha1', value: '1' }, dependsOn: ['y.ts'] },
      { file: 'y.ts', match: [], track: 'stable', url: '/y', hash: { algorithm: 'sha1', value: '2' }, dependsOn: ['x.ts'] },
    ]
    expect(() => topoSortScriptModulesWithDeps([cyclic[0]], cyclic)).toThrow(/Circular/)
  })
})
