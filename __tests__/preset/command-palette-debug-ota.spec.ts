jest.mock('../../preset/src/ui/notification/index', () => ({
  GME_notification: jest.fn(),
}))

import { registerCommandPaletteOtaDebug } from '../../preset/src/ui/command-palette/debug-ota'

describe('registerCommandPaletteOtaDebug', () => {
  const originalDevelop = (global as { __IS_DEVELOP_MODE__?: boolean }).__IS_DEVELOP_MODE__

  afterEach(() => {
    ;(global as { __IS_DEVELOP_MODE__?: boolean }).__IS_DEVELOP_MODE__ = originalDevelop
  })

  it('registers in-page editor-lib test command in develop mode', () => {
    ;(global as { __IS_DEVELOP_MODE__?: boolean }).__IS_DEVELOP_MODE__ = true
    const commands: Array<{ id: string; title?: string }> = []
    registerCommandPaletteOtaDebug((cmd) => commands.push(cmd))

    expect(commands.map((c) => c.id)).toEqual(['debug-editor-lib-test'])
    expect(commands[0]?.title).toContain('editor-lib')
  })

  it('skips registration when not in develop mode', () => {
    ;(global as { __IS_DEVELOP_MODE__?: boolean }).__IS_DEVELOP_MODE__ = false
    const commands: unknown[] = []
    registerCommandPaletteOtaDebug((cmd) => commands.push(cmd))
    expect(commands).toHaveLength(0)
  })
})
