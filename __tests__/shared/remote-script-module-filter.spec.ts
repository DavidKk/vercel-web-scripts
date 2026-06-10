import { filterDisabledRemoteModules, listDisabledRemoteModules } from '../../shared/remote-script-module-filter'

describe('remote-script-module-filter', () => {
  const sampleBundle = `
      // open-new-tab.ts
      ;(function(){ globalThis.__open = true })()

      // table-copy-csv.ts
      ;(function(){ globalThis.__table = true })()

      // shopline-debug.ts
      ;(function(){ globalThis.__debug = true })()
    `

  it('should remove disabled modules from cached remote bundle', () => {
    const filtered = filterDisabledRemoteModules(sampleBundle, {
      'table-copy-csv.ts': false,
      'open-new-tab.ts': true,
    })

    expect(filtered).toContain('open-new-tab.ts')
    expect(filtered).toContain('shopline-debug.ts')
    expect(filtered).not.toContain('table-copy-csv.ts')
    expect(filtered).not.toMatch(/globalThis\.__table/)
  })

  it('should list disabled modules present in bundle', () => {
    expect(
      listDisabledRemoteModules(sampleBundle, {
        'table-copy-csv.ts': false,
        'missing.ts': false,
      })
    ).toEqual(['table-copy-csv.ts'])
  })

  it('should leave bundle unchanged when extension map is absent', () => {
    expect(filterDisabledRemoteModules(sampleBundle, undefined)).toBe(sampleBundle)
  })
})
