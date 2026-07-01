jest.mock('../../preset/src/helpers/env', () => ({
  isExtensionPageContext: jest.fn(),
}))

jest.mock('../../preset/src/helpers/capture-screenshot', () => ({
  GME_downloadScreenshot: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../preset/src/helpers/logger', () => ({
  GME_fail: jest.fn(),
}))

jest.mock('../../preset/src/helpers/script-permission-scope', () => ({
  enterScriptPermissionScope: jest.fn(),
  exitScriptPermissionScope: jest.fn(),
}))

jest.mock('../../preset/src/ui/notification/index', () => ({
  GME_notification: jest.fn(),
}))

import { GME_downloadScreenshot } from '@/helpers/capture-screenshot'
import { isExtensionPageContext } from '@/helpers/env'
import { enterScriptPermissionScope, exitScriptPermissionScope } from '@/helpers/script-permission-scope'
import { GME_notification } from '@/ui/notification/index'

import { registerCommandPaletteScreenshotCommands } from '../../preset/src/ui/command-palette/screenshot-commands'

const mockedIsExtensionPageContext = isExtensionPageContext as jest.MockedFunction<typeof isExtensionPageContext>
const mockedDownload = GME_downloadScreenshot as jest.MockedFunction<typeof GME_downloadScreenshot>

describe('registerCommandPaletteScreenshotCommands', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsExtensionPageContext.mockReturnValue(true)
  })

  it('should register capture viewport command', () => {
    const commands: Array<{ id: string; title?: string; onShown?: () => boolean }> = []
    registerCommandPaletteScreenshotCommands((cmd) => commands.push(cmd))

    expect(commands.map((c) => c.id)).toEqual(['screenshot-viewport'])
    expect(commands[0]?.title).toBe('Capture viewport')
    expect(commands[0]?.onShown?.()).toBe(true)
  })

  it('should hide command outside extension page context', () => {
    mockedIsExtensionPageContext.mockReturnValue(false)
    const commands: Array<{ onShown?: () => boolean }> = []
    registerCommandPaletteScreenshotCommands((cmd) => commands.push(cmd))

    expect(commands[0]?.onShown?.()).toBe(false)
  })

  it('should download screenshot and notify on success', async () => {
    const commands: Array<{ action?: () => void }> = []
    registerCommandPaletteScreenshotCommands((cmd) => commands.push(cmd))

    commands[0]?.action?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(enterScriptPermissionScope).toHaveBeenCalledWith('__preset-screenshot__.ts', 'preset')
    expect(mockedDownload).toHaveBeenCalledWith({ format: 'png' })
    expect(GME_notification).toHaveBeenCalledWith('Viewport screenshot downloaded', 'success', 2000)
    expect(exitScriptPermissionScope).toHaveBeenCalled()
  })
})
