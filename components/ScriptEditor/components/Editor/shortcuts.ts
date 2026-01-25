'use client'

import { formatCode } from '@/utils/format'

import { restoreCursorPosition, saveCursorContext } from './utils'

/**
 * Register keyboard shortcuts for the Monaco editor
 * @param editor Monaco editor instance
 * @param monaco Monaco object
 * @param onDelete Callback for delete action
 * @param isInternalChangeRef Ref to track internal changes to avoid triggering onChange
 */
export function registerEditorShortcuts(editor: any, monaco: any, onSave?: () => void, onDelete?: () => void, isInternalChangeRef?: React.MutableRefObject<boolean>) {
  // Add Cmd+S / Ctrl+S keyboard shortcut
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
    // 1. Format code with cursor position preservation
    const currentContent = editor.getValue()
    const currentLanguage = editor.getModel()?.getLanguageId() || 'typescript'
    const formatted = await formatCode(currentContent, currentLanguage)

    if (formatted !== currentContent) {
      // Save view state (includes scroll position, folding, etc.)
      const viewState = editor.saveViewState()

      // Save cursor context for intelligent position restoration
      const cursorContext = saveCursorContext(editor, currentContent)

      // Apply formatted content
      if (isInternalChangeRef) {
        isInternalChangeRef.current = true
      }
      editor.setValue(formatted)

      // Use requestAnimationFrame to ensure setValue has completed and model is ready
      requestAnimationFrame(() => {
        if (isInternalChangeRef) {
          isInternalChangeRef.current = false
        }
        // Restore view state first (preserves scroll position, folding, etc.)
        if (viewState) {
          editor.restoreViewState(viewState)
        }

        // Then restore cursor position using context matching
        if (cursorContext) {
          restoreCursorPosition(editor, formatted, cursorContext)
        }
      })
    }

    // 2. Trigger onSave
    if (onSave) {
      onSave()
    }
  })
}
