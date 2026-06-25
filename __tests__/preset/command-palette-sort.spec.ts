import { sortCommandPaletteCommands } from '../../preset/src/ui/command-palette/sort-commands'

describe('sortCommandPaletteCommands', () => {
  const cmd = (id: string, title: string) => ({ id, title, action: () => {} })

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
})
