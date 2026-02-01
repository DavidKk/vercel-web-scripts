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
  isLocalDevMode,
  LOCAL_DEV_EVENT_KEY,
}
