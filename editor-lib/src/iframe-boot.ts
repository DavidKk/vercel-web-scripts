import { EDITOR_MSG_PREFIX, type EditorIframeInitMessage, type EditorIframeMessage } from '@/iframe-protocol'
import { createDirectEditorView } from '@/profiles'
import type { EditorProfile } from '@/types'

let iframeView: ReturnType<typeof createDirectEditorView> | null = null

/**
 * Run inside iframe when `window.__VWS_EDITOR_IFRAME_MODE__` is set.
 * Listens for parent postMessage commands and hosts CM6.
 */
export function runIframeEditorHost(): void {
  const mount = document.createElement('div')
  mount.style.cssText = 'height:100vh;width:100%;margin:0;padding:0;'
  document.body.style.margin = '0'
  document.body.style.background = '#171a21'
  document.body.appendChild(mount)

  const notifyParent = (message: EditorIframeMessage) => {
    try {
      window.parent.postMessage(message, '*')
    } catch {
      /* ignore */
    }
  }

  window.addEventListener('message', (event) => {
    const data = event.data
    if (!data || typeof data !== 'object' || typeof (data as { type?: unknown }).type !== 'string') {
      return
    }
    const type = (data as { type: string }).type

    if (type === `${EDITOR_MSG_PREFIX}-init`) {
      const init = data as EditorIframeInitMessage
      if (iframeView) {
        iframeView.destroy()
        iframeView = null
      }
      const profile = (init.profile || 'plain') as EditorProfile
      iframeView = createDirectEditorView(mount, {
        profile,
        readOnly: init.readOnly,
        value: init.value,
        onChange: (value) => notifyParent({ type: `${EDITOR_MSG_PREFIX}-change`, value }),
        styleParent: document,
      })
      return
    }

    if (!iframeView) {
      return
    }

    if (type === `${EDITOR_MSG_PREFIX}-get-value`) {
      const requestId = (data as { requestId?: string }).requestId
      notifyParent({ type: `${EDITOR_MSG_PREFIX}-value`, value: iframeView.state.doc.toString(), requestId })
      return
    }

    if (type === `${EDITOR_MSG_PREFIX}-set-value`) {
      const value = (data as { value?: string }).value ?? ''
      iframeView.dispatch({
        changes: { from: 0, to: iframeView.state.doc.length, insert: value },
      })
      return
    }

    if (type === `${EDITOR_MSG_PREFIX}-focus`) {
      iframeView.focus()
      return
    }

    if (type === `${EDITOR_MSG_PREFIX}-destroy`) {
      iframeView.destroy()
      iframeView = null
    }
  })

  notifyParent({ type: `${EDITOR_MSG_PREFIX}-ready` })
}
