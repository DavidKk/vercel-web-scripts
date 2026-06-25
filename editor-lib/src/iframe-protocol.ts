/** postMessage protocol prefix for editor-lib iframe mode. */
export const EDITOR_MSG_PREFIX = 'vws-editor'

export type EditorIframeMessageType =
  | `${typeof EDITOR_MSG_PREFIX}-init`
  | `${typeof EDITOR_MSG_PREFIX}-ready`
  | `${typeof EDITOR_MSG_PREFIX}-change`
  | `${typeof EDITOR_MSG_PREFIX}-contextmenu`
  | `${typeof EDITOR_MSG_PREFIX}-get-value`
  | `${typeof EDITOR_MSG_PREFIX}-value`
  | `${typeof EDITOR_MSG_PREFIX}-set-value`
  | `${typeof EDITOR_MSG_PREFIX}-focus`
  | `${typeof EDITOR_MSG_PREFIX}-destroy`

export interface EditorIframeInitMessage {
  type: `${typeof EDITOR_MSG_PREFIX}-init`
  profile: string
  readOnly: boolean
  value: string
}

export interface EditorIframeChangeMessage {
  type: `${typeof EDITOR_MSG_PREFIX}-change`
  value: string
}

export interface EditorIframeValueMessage {
  type: `${typeof EDITOR_MSG_PREFIX}-value`
  value: string
  requestId?: string
}

export interface EditorIframeSetValueMessage {
  type: `${typeof EDITOR_MSG_PREFIX}-set-value`
  value: string
}

export interface EditorIframeRequestMessage {
  type: `${typeof EDITOR_MSG_PREFIX}-get-value` | `${typeof EDITOR_MSG_PREFIX}-focus` | `${typeof EDITOR_MSG_PREFIX}-destroy`
  requestId?: string
}

export interface EditorIframeContextMenuMessage {
  type: `${typeof EDITOR_MSG_PREFIX}-contextmenu`
  x: number
  y: number
}

export type EditorIframeMessage =
  | EditorIframeInitMessage
  | { type: `${typeof EDITOR_MSG_PREFIX}-ready` }
  | EditorIframeChangeMessage
  | EditorIframeContextMenuMessage
  | EditorIframeValueMessage
  | EditorIframeSetValueMessage
  | EditorIframeRequestMessage

/**
 * Type guard for editor iframe messages.
 * @param data Unknown postMessage data
 */
export function isEditorIframeMessage(data: unknown): data is EditorIframeMessage {
  return (
    !!data &&
    typeof data === 'object' &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string' &&
    (data as { type: string }).type.startsWith(`${EDITOR_MSG_PREFIX}-`)
  )
}

/**
 * Build srcdoc HTML that boots editor-lib in iframe mode.
 * @param scriptUrl Absolute editor-lib.js URL
 */
export function buildIframeSrcdoc(scriptUrl: string): string {
  const escaped = scriptUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>window.__VWS_EDITOR_IFRAME_MODE__=true;<\/script><script src="${escaped}"><\/script></body></html>`
}
