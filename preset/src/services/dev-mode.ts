/**
 * Dev mode constants and utility functions
 */

const LOCAL_DEV_EVENT_KEY = 'files@web-script-dev'
const EDITOR_DEV_EVENT_KEY = 'files@web-script-editor-dev'
const EDITOR_POST_MESSAGE_TYPE = 'web-script-editor-message'

/**
 * Check if local dev mode is active
 * @returns True if local dev mode is active
 */
function isLocalDevMode(): boolean {
  return !!GM_getValue(LOCAL_DEV_EVENT_KEY)
}

/**
 * Get the host ID of the active local dev mode
 * @returns The host ID or empty string
 */

function getLocalDevHost(): string {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { host?: string } | null
  return response?.host || ''
}

/**
 * Get the files from local dev mode
 * @returns The files object or empty object
 */

function getLocalDevFiles(): Record<string, string> {
  const response = GM_getValue(LOCAL_DEV_EVENT_KEY) as { files?: Record<string, string> } | null
  return response?.files || {}
}

/**
 * Check if editor dev mode is active
 * @returns True if editor dev mode is active
 */
function isEditorDevMode(): boolean {
  return !!GM_getValue(EDITOR_DEV_EVENT_KEY)
}

/**
 * Get the host ID of the active editor dev mode
 * @returns The host ID or empty string
 */

function getEditorDevHost(): string {
  const response = GM_getValue(EDITOR_DEV_EVENT_KEY) as { host?: string } | null
  return response?.host || ''
}

/**
 * Check if current page is the editor page (pathname matches __EDITOR_URL__).
 * Used to skip remote script execution on editor (HOST) and to set up postMessage listener.
 */
function isEditorPage(): boolean {
  if (typeof window === 'undefined' || typeof __EDITOR_URL__ === 'undefined') return false
  try {
    const editorPath = new URL(__EDITOR_URL__).pathname.replace(/\/$/, '') || '/'
    const p = window.location.pathname
    return p === editorPath || p.startsWith(editorPath + '/')
  } catch {
    return false
  }
}

/**
 * Check if any dev mode is active
 * @returns 'local' if local dev mode is active, 'editor' if editor dev mode is active, null otherwise
 */

function getActiveDevMode(): 'local' | 'editor' | null {
  if (isLocalDevMode()) {
    return 'local'
  }
  if (isEditorDevMode()) {
    return 'editor'
  }
  return null
}

export {
  EDITOR_DEV_EVENT_KEY,
  EDITOR_POST_MESSAGE_TYPE,
  getActiveDevMode,
  getEditorDevHost,
  getLocalDevFiles,
  getLocalDevHost,
  isEditorDevMode,
  isEditorPage,
  isLocalDevMode,
  LOCAL_DEV_EVENT_KEY,
}
