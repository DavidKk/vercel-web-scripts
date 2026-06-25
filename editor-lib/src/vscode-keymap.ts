import { copyLineDown, copyLineUp, deleteLine, indentLess, indentMore, moveLineDown, moveLineUp, selectLine, toggleComment } from '@codemirror/commands'
import { closeSearchPanel, findNext, findPrevious, openSearchPanel, searchPanelOpen, selectNextOccurrence, selectSelectionMatches } from '@codemirror/search'
import type { Command, KeyBinding } from '@codemirror/view'

import { openReplacePanel } from '@/search-extensions'

const editorScope = 'editor'

/**
 * Run find navigation while the search panel is open (editor body focus).
 * @param runner findNext or findPrevious
 */
function createFindNavigateCommand(runner: Command): Command {
  return (view) => {
    if (!searchPanelOpen(view.state)) {
      return false
    }
    return runner(view)
  }
}

const findNextInEditor = createFindNavigateCommand(findNext)
const findPreviousInEditor = createFindNavigateCommand(findPrevious)

/**
 * Close search panel when open; otherwise let other bindings handle Escape.
 */
const closeSearchPanelWhenOpen: Command = (view) => {
  if (!searchPanelOpen(view.state)) {
    return false
  }
  return closeSearchPanel(view)
}

/**
 * VS Code–style editor shortcuts (Mac/Win). Merged after CM defaults so editor-scoped
 * bindings work while typing in the document, not only when the search field is focused.
 */
export const vscodeEditorKeymap: readonly KeyBinding[] = [
  // Find / replace
  { key: 'Mod-f', run: openSearchPanel, scope: editorScope, preventDefault: true },
  { key: 'Mod-h', run: openReplacePanel, scope: editorScope, preventDefault: true },
  { key: 'Mod-Alt-f', run: openReplacePanel, scope: editorScope, preventDefault: true },
  { key: 'Mod-Alt-h', run: openReplacePanel, scope: editorScope, preventDefault: true },

  // Find next / previous (while search panel is open)
  { key: 'Mod-g', run: findNextInEditor, scope: editorScope, preventDefault: true },
  { key: 'Shift-Mod-g', run: findPreviousInEditor, scope: editorScope, preventDefault: true },
  { key: 'F3', run: findNextInEditor, shift: findPreviousInEditor, scope: editorScope, preventDefault: true },

  // Multi-cursor / selection (Cmd+D = add next match; Cmd+Shift+L = select all matches)
  { key: 'Mod-d', run: selectNextOccurrence, scope: editorScope, preventDefault: true },
  { key: 'Mod-Shift-l', run: selectSelectionMatches, scope: editorScope, preventDefault: true },

  { key: 'Escape', run: closeSearchPanelWhenOpen, scope: editorScope },

  // Line editing
  { key: 'Mod-l', run: selectLine, scope: editorScope, preventDefault: true },
  { key: 'Alt-ArrowUp', run: moveLineUp, scope: editorScope },
  { key: 'Alt-ArrowDown', run: moveLineDown, scope: editorScope },
  { key: 'Shift-Alt-ArrowUp', run: copyLineUp, scope: editorScope },
  { key: 'Shift-Alt-ArrowDown', run: copyLineDown, scope: editorScope },
  { key: 'Shift-Mod-k', run: deleteLine, scope: editorScope },

  // Indent / comment
  { key: 'Mod-[', run: indentLess, scope: editorScope },
  { key: 'Mod-]', run: indentMore, scope: editorScope },
  { key: 'Mod-/', run: toggleComment, scope: editorScope },
]
