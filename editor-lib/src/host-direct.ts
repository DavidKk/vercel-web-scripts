import { createDirectEditorView } from '@/profiles'
import type { EditorHandle, EditorLibCreateOptions, EditorProfile } from '@/types'

/**
 * Create editor mounted directly in parent (shadow DOM for style isolation).
 * @param options Create options
 * @returns Editor handle
 */
export function createDirectEditor(options: EditorLibCreateOptions): EditorHandle {
  const profile: EditorProfile = options.profile ?? 'plain'
  const readOnly = options.readOnly ?? false
  const value = options.value ?? ''

  const host = options.parent.ownerDocument.createElement('div')
  host.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:120px;'
  options.parent.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })
  const mount = document.createElement('div')
  mount.style.cssText = 'flex:1;min-height:0;overflow:hidden;'
  shadow.appendChild(mount)

  const view = createDirectEditorView(mount, {
    profile,
    readOnly,
    value,
    onChange: options.onChange,
    styleParent: shadow,
  })

  return {
    getValue: () => view.state.doc.toString(),
    setValue: (next) => {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
      })
    },
    focus: () => view.focus(),
    destroy: () => {
      view.destroy()
      host.remove()
    },
  }
}
