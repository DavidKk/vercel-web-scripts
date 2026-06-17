/**
 * DEBUG command-palette entries for script permission gates (dev only).
 */

import { GME_notification } from '@/ui/notification/index'

import type { CommandPaletteCommand } from './index'

const DEBUG_FILE = '__debug-command-palette__.ts'
const DEFAULT_HOST = 'example.com'
const DEBUG_CLIPBOARD_TEXT = '[VWS debug] command-palette clipboard write'

type RegisterCommand = (command: CommandPaletteCommand) => void

/**
 * Normalize palette input into an https URL.
 * @param input Optional host or URL from the palette input
 * @returns Absolute URL for network / open-tab tests
 */
function resolveUrlFromInput(input?: string): string {
  const raw = input?.trim() || DEFAULT_HOST
  return raw.includes('://') ? raw : `https://${raw}/`
}

/**
 * Run an action inside a user-script permission scope for debug prompts.
 * @param run Callback that invokes a gated GM API
 */
function withDebugPermissionScope(run: () => void): void {
  enterScriptPermissionScope(DEBUG_FILE, 'debug')
  run()
}

/**
 * Register dev-only permission debug commands in the command palette.
 * @param register `GME_registerCommandPaletteCommand` from command-palette
 */
export function registerCommandPalettePermissionDebug(register: RegisterCommand): void {
  if (typeof __IS_DEVELOP_MODE__ === 'undefined' || !__IS_DEVELOP_MODE__) {
    return
  }

  register({
    id: 'debug-permission-network',
    keywords: ['debug', 'permission', 'network', 'xhr', 'gm_xmlhttprequest'],
    title: 'DEBUG Permission: Network (XHR)',
    icon: '⎋',
    hint: `GM_xmlhttpRequest — input: host or URL (default ${DEFAULT_HOST})`,
    action: (input) => {
      const url = resolveUrlFromInput(input)
      withDebugPermissionScope(() => {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          onload: (res) => {
            exitScriptPermissionScope()
            GME_notification(`XHR allowed (${res.status})`, 'success', 2500)
          },
          onerror: (err) => {
            exitScriptPermissionScope()
            const message = err instanceof Error ? err.message : String(err)
            GME_notification(`XHR denied: ${message}`, 'error', 3500)
          },
        })
      })
    },
  })

  register({
    id: 'debug-permission-clipboard-write',
    keywords: ['debug', 'permission', 'clipboard', 'write', 'copy'],
    title: 'DEBUG Permission: Write clipboard',
    icon: '⎘',
    hint: 'GM_setClipboard — triggers clipboard-write gate',
    action: () => {
      withDebugPermissionScope(() => {
        GM_setClipboard(DEBUG_CLIPBOARD_TEXT, undefined, () => {
          exitScriptPermissionScope()
          GME_notification('Clipboard write allowed', 'success', 2500)
        })
      })
    },
  })

  register({
    id: 'debug-permission-clipboard-read',
    keywords: ['debug', 'permission', 'clipboard', 'read', 'paste'],
    title: 'DEBUG Permission: Read clipboard',
    icon: '⎗',
    hint: 'navigator.clipboard.readText (browser prompt, not script gate)',
    action: () => {
      if (!navigator.clipboard?.readText) {
        GME_notification('clipboard.readText unavailable', 'error', 3000)
        return
      }
      void navigator.clipboard
        .readText()
        .then((value) => {
          const preview = value.length > 80 ? `${value.slice(0, 80)}…` : value
          GME_notification(preview ? `Read: ${preview}` : 'Clipboard empty', 'info', 4000)
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          GME_notification(`Read failed: ${message}`, 'error', 3500)
        })
    },
  })

  register({
    id: 'debug-permission-open-tab',
    keywords: ['debug', 'permission', 'tab', 'open', 'openintab'],
    title: 'DEBUG Permission: Open tab',
    icon: '↗',
    hint: `GM_openInTab — input: host or URL (default ${DEFAULT_HOST})`,
    action: (input) => {
      const url = resolveUrlFromInput(input)
      withDebugPermissionScope(() => {
        GM_openInTab(url)
        GME_notification('Open tab requested — respond to the permission modal', 'info', 2500)
      })
    },
  })
}
