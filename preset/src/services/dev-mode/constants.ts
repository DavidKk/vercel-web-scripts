/**
 * Dev mode constants and read-only state helpers
 */

import { GME_debug } from '@/helpers/logger'

export const LOCAL_DEV_EVENT_KEY = 'files@web-script-dev'
export const EDITOR_DEV_EVENT_KEY = 'files@web-script-editor-dev'
export const EDITOR_POST_MESSAGE_TYPE = 'web-script-editor-message'

/**
 * Check if local dev mode is active
 * @returns True if local dev mode is active
 */
export function isLocalDevMode(): boolean {
  return !!GM_getValue(LOCAL_DEV_EVENT_KEY)
}

/**
 * Get the host ID of the active local dev mode
 * @returns The host ID or empty string
 */
export function getLocalDevHost(): string {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { host?: string } | null
  return response?.host || ''
}

/**
 * Get the files from local dev mode
 * @returns The files object or empty object
 */
export function getLocalDevFiles(): Record<string, string> {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { files?: Record<string, string> } | null
  return response?.files || {}
}

/**
 * Check if editor dev mode is active
 * @returns True if editor dev mode is active
 */
export function isEditorDevMode(): boolean {
  return !!GM_getValue(EDITOR_DEV_EVENT_KEY)
}

/**
 * Get the host ID of the active editor dev mode
 * @returns The host ID or empty string
 */
export function getEditorDevHost(): string {
  const response = GM_getValue(EDITOR_DEV_EVENT_KEY) as { host?: string } | null
  return response?.host || ''
}

/**
 * Check if current page is the editor page (pathname matches __EDITOR_URL__).
 * Used to skip remote script execution on editor (HOST) and to set up postMessage listener.
 */
export function isEditorPage(): boolean {
  if (typeof window === 'undefined' || typeof __EDITOR_URL__ === 'undefined') return false
  try {
    const editorPath = new URL(__EDITOR_URL__).pathname.replace(/\/$/, '') || '/'
    const p = window.location.pathname
    return p === editorPath || p.startsWith(editorPath + '/')
  } catch (e) {
    GME_debug('[dev-mode] isEditorPage failed:', e instanceof Error ? e.message : String(e))
    return false
  }
}

/**
 * Check if any dev mode is active
 * @returns 'local' if local dev mode is active, 'editor' if editor dev mode is active, null otherwise
 */
export function getActiveDevMode(): 'local' | 'editor' | null {
  if (isLocalDevMode()) {
    return 'local'
  }
  if (isEditorDevMode()) {
    return 'editor'
  }
  return null
}
