'use client'

import { formatCode } from '@/utils/format'

import { restoreCursorPosition, saveCursorContext } from './utils'

/**
 * Register keyboard shortcuts for the Monaco editor
 * @param editor Monaco editor instance
 * @param monaco Monaco object
 * @param language Language of the current file
 * @param onSave Callback for save action
 */
export function registerEditorShortcuts(editor: any, monaco: any, language: string, onSave?: () => void) {
  // Add Cmd+S keyboard shortcut
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
    // 1. Format code with cursor position preservation
    const currentContent = editor.getValue()
    const formatted = await formatCode(currentContent, language)

    if (formatted !== currentContent) {
      // Save view state (includes scroll position, folding, etc.)
      const viewState = editor.saveViewState()

      // Save cursor context for intelligent position restoration
      const cursorContext = saveCursorContext(editor, currentContent)

      // Apply formatted content
      editor.setValue(formatted)

      // Use requestAnimationFrame to ensure setValue has completed and model is ready
      requestAnimationFrame(() => {
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
