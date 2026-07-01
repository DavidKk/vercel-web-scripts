/**
 * Command palette entry for viewport screenshot (extension shell only).
 */

import { GME_downloadScreenshot } from '@/helpers/capture-screenshot'
import { isExtensionPageContext } from '@/helpers/env'
import { GME_fail } from '@/helpers/logger'
import { enterScriptPermissionScope, exitScriptPermissionScope } from '@/helpers/script-permission-scope'
import { GME_notification } from '@/ui/notification/index'
import iconViewport from '~icons/mdi/monitor-screenshot?raw'

import type { CommandPaletteCommand } from './index'

const PRESET_SCREENSHOT_FILE = '__preset-screenshot__.ts'

let screenshotCommandInFlight = false

type RegisterCommand = (command: CommandPaletteCommand) => void

function isScreenshotCommandAvailable(): boolean {
  return isExtensionPageContext()
}

async function runPresetScreenshot(): Promise<void> {
  if (screenshotCommandInFlight) {
    GME_notification('Screenshot in progress, please wait', 'warn', 2500)
    return
  }
  screenshotCommandInFlight = true
  enterScriptPermissionScope(PRESET_SCREENSHOT_FILE, 'preset')
  try {
    await GME_downloadScreenshot({ format: 'png' })
    GME_notification('Viewport screenshot downloaded', 'success', 2000)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    GME_fail(`[Screenshot] command:failed`, message)
    GME_notification(`Screenshot failed: ${message}`, 'error', 4000)
  } finally {
    screenshotCommandInFlight = false
    exitScriptPermissionScope()
  }
}

/**
 * Register viewport screenshot command in the command palette (extension shell only).
 * @param register `GME_registerCommandPaletteCommand` from command-palette
 */
export function registerCommandPaletteScreenshotCommands(register: RegisterCommand): void {
  register({
    id: 'screenshot-viewport',
    keywords: ['screenshot', 'capture', 'viewport', 'visible'],
    title: 'Capture viewport',
    iconHtml: iconViewport,
    hint: 'Capture visible viewport and download PNG',
    contextScope: 'page',
    onShown: () => isScreenshotCommandAvailable(),
    action: () => {
      void runPresetScreenshot()
    },
  })
}
