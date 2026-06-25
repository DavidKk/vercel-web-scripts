import { buildIframeSrcdoc, EDITOR_MSG_PREFIX, isEditorIframeMessage } from '@/iframe-protocol'
import type { EditorHandle, EditorLibCreateOptions, EditorProfile } from '@/types'

/**
 * Resolve script URL for iframe re-load (set by loader or current script src).
 */
function resolveEditorLibScriptUrl(): string | null {
  if (typeof window !== 'undefined' && window.__VWS_EDITOR_LIB_SCRIPT_URL__) {
    return window.__VWS_EDITOR_LIB_SCRIPT_URL__
  }
  if (typeof document !== 'undefined') {
    const scripts = document.getElementsByTagName('script')
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i]?.src
      if (src && /\/editor-lib\.js(?:$|[?#])/i.test(src)) {
        return src
      }
    }
  }
  return null
}

const IFRAME_STYLE = 'border:0;width:100%;height:100%;min-height:120px;display:block;background:#171a21;'

/**
 * Create editor in an isolated iframe with postMessage protocol.
 * @param options Create options
 * @returns Editor handle
 */
export function createIsolatedEditor(options: EditorLibCreateOptions): EditorHandle {
  const profile: EditorProfile = options.profile ?? 'plain'
  const readOnly = options.readOnly ?? false
  const value = options.value ?? ''
  const scriptUrl = resolveEditorLibScriptUrl()
  if (!scriptUrl) {
    throw new Error('[editor-lib] Cannot resolve editor-lib.js URL for iframe mode')
  }

  const iframe = options.parent.ownerDocument.createElement('iframe')
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  iframe.style.cssText = IFRAME_STYLE
  iframe.srcdoc = buildIframeSrcdoc(scriptUrl)
  options.parent.appendChild(iframe)

  let ready = false
  let cachedValue = value
  let destroyed = false

  const post = (message: Record<string, unknown>) => {
    if (destroyed || !iframe.contentWindow) {
      return
    }
    iframe.contentWindow.postMessage(message, '*')
  }

  const initEditor = () => {
    if (destroyed || ready) {
      return
    }
    ready = true
    post({
      type: `${EDITOR_MSG_PREFIX}-init`,
      profile,
      readOnly,
      value: cachedValue,
    })
  }

  const onMessage = (event: MessageEvent) => {
    if (destroyed || event.source !== iframe.contentWindow) {
      return
    }
    if (!isEditorIframeMessage(event.data)) {
      return
    }
    const data = event.data
    if (data.type === `${EDITOR_MSG_PREFIX}-ready`) {
      initEditor()
      return
    }
    if (data.type === `${EDITOR_MSG_PREFIX}-change` && 'value' in data) {
      cachedValue = data.value
      options.onChange?.(data.value)
    }
  }

  window.addEventListener('message', onMessage)

  return {
    getValue: () => cachedValue,
    setValue: (next) => {
      cachedValue = next
      if (ready) {
        post({ type: `${EDITOR_MSG_PREFIX}-set-value`, value: next })
      }
    },
    focus: () => {
      post({ type: `${EDITOR_MSG_PREFIX}-focus` })
    },
    destroy: () => {
      destroyed = true
      post({ type: `${EDITOR_MSG_PREFIX}-destroy` })
      window.removeEventListener('message', onMessage)
      iframe.remove()
    },
  }
}
