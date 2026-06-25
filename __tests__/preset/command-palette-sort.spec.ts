import { getCommandPaletteSortTier, sortCommandPaletteCommands } from '../../preset/src/ui/command-palette/sort-commands'

describe('sortCommandPaletteCommands', () => {
  const cmd = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, title, action: () => {}, ...extra })

  it('keeps non-DEBUG commands before DEBUG block', () => {
    const sorted = sortCommandPaletteCommands([cmd('debug-ota', 'DEBUG OTA: Test editor-lib'), cmd('log', 'Open Log Viewer'), cmd('debug-perm', 'DEBUG Permission: Network (XHR)')])

    expect(sorted.map((c) => c.id)).toEqual(['log', 'debug-perm', 'debug-ota'])
  })

  it('groups DEBUG Permission then DEBUG OTA then other DEBUG demos', () => {
    const sorted = sortCommandPaletteCommands([
      cmd('corner', 'DEBUG Corner Widget Demo'),
      cmd('ota-b', 'DEBUG OTA: Second module'),
      cmd('perm-b', 'DEBUG Permission: Open tab'),
      cmd('toolbar', 'DEBUG Node Toolbar Demo'),
      cmd('perm-a', 'DEBUG Permission: Network (XHR)'),
      cmd('ota-a', 'DEBUG OTA: Test editor-lib'),
      cmd('log', 'Open Log Viewer'),
    ])

    expect(sorted.map((c) => c.id)).toEqual(['log', 'perm-b', 'perm-a', 'ota-b', 'ota-a', 'corner', 'toolbar'])
  })

  it('should cluster multiple DEBUG OTA commands together', () => {
    const sorted = sortCommandPaletteCommands([
      cmd('ota-c', 'DEBUG OTA: Third'),
      cmd('log', 'Open Log Viewer'),
      cmd('ota-a', 'DEBUG OTA: First'),
      cmd('perm', 'DEBUG Permission: XHR'),
      cmd('ota-b', 'DEBUG OTA: Second'),
    ])

    expect(sorted.map((c) => c.id)).toEqual(['log', 'perm', 'ota-c', 'ota-a', 'ota-b'])
  })

  it('should move only page-scoped non-DEBUG commands to the front', () => {
    const sorted = sortCommandPaletteCommands([
      cmd('log', 'Open Log Viewer'),
      cmd('domain', 'Sync shop settings', { contextScope: 'domain' }),
      cmd('page-b', 'Save this page', { contextScope: 'page' }),
      cmd('global', 'Export data'),
      cmd('page-a', 'Edit this template', { contextScope: 'page' }),
    ])

    expect(sorted.map((c) => c.id)).toEqual(['page-b', 'page-a', 'log', 'domain', 'global'])
  })

  it('should not treat hint-only "this page" as page scope', () => {
    expect(getCommandPaletteSortTier(cmd('clear', 'Clear All Node Marks', { hint: 'Remove every node selector mark on this page' }))).toBe(1)
  })

  it('should infer page scope from title only, not hint', () => {
    expect(getCommandPaletteSortTier(cmd('a', '刷新本页缓存'))).toBe(0)
    expect(getCommandPaletteSortTier(cmd('b', 'Open on this page'))).toBe(0)
    expect(getCommandPaletteSortTier(cmd('c', 'Apply to current host', { contextScope: 'domain' }))).toBe(1)
    expect(getCommandPaletteSortTier(cmd('d', 'Open Log Viewer'))).toBe(1)
    expect(getCommandPaletteSortTier(cmd('e', 'DEBUG OTA: 本页测试'))).toBe(2)
    expect(getCommandPaletteSortTier(cmd('f', 'Shopline tool', { hint: '仅本页生效' }))).toBe(1)
  })

  it('should keep DEBUG last even when contextScope is page', () => {
    const sorted = sortCommandPaletteCommands([
      cmd('log', 'Open Log Viewer'),
      cmd('page', 'Edit this template', { contextScope: 'page' }),
      cmd('debug-ota', 'DEBUG OTA: Test editor-lib', { contextScope: 'page' }),
      cmd('debug-perm', 'DEBUG Permission: Network (XHR)'),
    ])

    expect(sorted.map((c) => c.id)).toEqual(['page', 'log', 'debug-perm', 'debug-ota'])
  })
})
