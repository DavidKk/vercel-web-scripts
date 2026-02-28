'use client'

/** Built-in Monaco action IDs for fold level 1..7 */
const FOLD_LEVEL_ACTIONS = [
  'editor.foldLevel1',
  'editor.foldLevel2',
  'editor.foldLevel3',
  'editor.foldLevel4',
  'editor.foldLevel5',
  'editor.foldLevel6',
  'editor.foldLevel7',
] as const

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

  // Cmd+K+1..7: fold to level 1..7 (chord: Cmd+K then digit)
  const foldLevelKeys = [
    monaco.KeyCode.Digit1,
    monaco.KeyCode.Digit2,
    monaco.KeyCode.Digit3,
    monaco.KeyCode.Digit4,
    monaco.KeyCode.Digit5,
    monaco.KeyCode.Digit6,
    monaco.KeyCode.Digit7,
  ]
  for (let i = 0; i < FOLD_LEVEL_ACTIONS.length; i++) {
    const actionId = FOLD_LEVEL_ACTIONS[i]
    const key = foldLevelKeys[i]
    const chord = monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, key)
    editor.addCommand(chord, () => {
      editor.getAction?.(actionId)?.run()
    })
  }
}
