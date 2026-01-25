'use client'

/**
 * Save cursor context for position restoration after formatting
 * @param editor Monaco editor instance
 * @param content Current editor content
 * @returns Cursor context information
 */
export function saveCursorContext(editor: any, content: string) {
  const position = editor.getPosition()
  const selection = editor.getSelection()
  const model = editor.getModel()

  if (!position || !model) {
    return null
  }

  // Get cursor offset in the document
  const cursorOffset = model.getOffsetAt(position)

  // Extract context around cursor (20 characters before and after)
  const contextBefore = Math.max(0, cursorOffset - 20)
  const contextAfter = Math.min(content.length, cursorOffset + 20)
  const beforeText = content.substring(contextBefore, cursorOffset)
  const afterText = content.substring(cursorOffset, contextAfter)

  // Get current line content for fallback
  const currentLine = position.lineNumber
  const lineContent = model.getLineContent(currentLine)

  return {
    position,
    selection,
    cursorOffset,
    beforeText,
    afterText,
    currentLine,
    lineContent,
  }
}

/**
 * Restore cursor position after formatting using context matching
 * @param editor Monaco editor instance
 * @param formattedContent Formatted content
 * @param context Saved cursor context
 * @returns True if position was restored successfully
 */
export function restoreCursorPosition(editor: any, formattedContent: string, context: any): boolean {
  if (!context) {
    return false
  }

  const model = editor.getModel()
  if (!model) {
    return false
  }

  // Strategy 1: Try to find cursor position by matching text context
  const searchPattern = context.beforeText + context.afterText
  if (searchPattern.length > 0) {
    const index = formattedContent.indexOf(searchPattern)
    if (index !== -1) {
      // Found matching context, calculate new position
      const newOffset = index + context.beforeText.length
      const newPosition = model.getPositionAt(newOffset)
      if (newPosition) {
        editor.setPosition(newPosition)
        editor.revealLineInCenter(newPosition.lineNumber)
        return true
      }
    }
  }

  // Strategy 2: Try to find by matching beforeText only (more flexible)
  if (context.beforeText.length > 0) {
    const lastIndex = formattedContent.lastIndexOf(context.beforeText)
    if (lastIndex !== -1) {
      const newOffset = lastIndex + context.beforeText.length
      const newPosition = model.getPositionAt(newOffset)
      if (newPosition) {
        editor.setPosition(newPosition)
        editor.revealLineInCenter(newPosition.lineNumber)
        return true
      }
    }
  }

  // Strategy 3: Fallback to same line number (if still valid)
  const maxLine = model.getLineCount()
  if (context.currentLine <= maxLine) {
    const lineContent = model.getLineContent(context.currentLine)
    // Try to find similar position in the line
    let column = context.position.column
    if (column > lineContent.length + 1) {
      column = lineContent.length + 1
    }
    const fallbackPosition = { lineNumber: context.currentLine, column }
    editor.setPosition(fallbackPosition)
    editor.revealLineInCenter(context.currentLine)
    return true
  }

  // Strategy 4: Fallback to end of document
  const lastLine = model.getLineCount()
  const lastLineContent = model.getLineContent(lastLine)
  editor.setPosition({ lineNumber: lastLine, column: lastLineContent.length + 1 })
  editor.revealLineInCenter(lastLine)
  return false
}
