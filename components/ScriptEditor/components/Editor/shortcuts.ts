'use client'

/**
 * Register keyboard shortcuts for the Monaco editor
 * @param editor Monaco editor instance
 * @param monaco Monaco object
 * @param onSave Callback for save action
 * @param onDelete Callback for delete action
 * @param isInternalChangeRef Ref to track internal changes to avoid triggering onChange
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- onDelete, isInternalChangeRef kept for API compatibility */
export function registerEditorShortcuts(editor: any, monaco: any, onSave?: () => void, onDelete?: () => void, isInternalChangeRef?: React.MutableRefObject<boolean>) {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  // Cmd+S / Ctrl+S: save only (no format — format caused cursor to jump to 1,1)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    if (onSave) {
      onSave()
    }
  })
}
