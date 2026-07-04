/**
 * Keyboard helpers for command-palette global shortcuts.
 */

/**
 * Whether keydown is the physical backquote key (`~ key on US QWERTY).
 * Uses `event.code` so Chinese / alternate layouts still match (event.key may be `·`, etc.).
 * @param event Keyboard event or minimal pick
 * @returns True when the backquote shortcut key was pressed
 */
export function isCommandPaletteBackquoteKey(event: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return event.code === 'Backquote' || event.key === '`' || event.key === '~'
}

/**
 * Whether the keyboard event target is inside an editable field (including shadow DOM).
 * @param event Keyboard event
 * @returns True when focus is in input, textarea, or contenteditable
 */
export function isKeyboardEventInEditableTarget(event: KeyboardEvent): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
  return path.some((node) => {
    if (!(node instanceof HTMLElement)) {
      return false
    }
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      return true
    }
    return node.isContentEditable && node.getAttribute('contenteditable') === 'true'
  })
}
