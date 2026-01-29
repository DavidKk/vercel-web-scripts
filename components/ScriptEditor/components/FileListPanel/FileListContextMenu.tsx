'use client'

import type { FileListConfirmState, FileListContextMenuState } from './types'

export interface FileListContextMenuProps {
  /** Current context menu state (position + target); null when closed */
  contextMenu: FileListContextMenuState | null
  /** Ref for the menu container (outside click to close) */
  contextMenuRef: React.RefObject<HTMLDivElement | null>
  /** Callback when file/folder is renamed */
  onRenameFile?: (oldPath: string, newPath: string) => void
  /** Whether the file at path has unsaved changes */
  hasUnsavedChanges: (path: string) => boolean
  /** Set confirm dialog state (delete, reset file) */
  setConfirmState: (state: FileListConfirmState) => void
  /** Close context menu */
  setContextMenu: (menu: FileListContextMenuState | null) => void
  /** Start rename for the given path/name */
  onStartRename: (path: string, name: string) => void
  /** Callback when file is deleted */
  onDeleteFile?: (filePath: string) => void
}

/**
 * Right-click context menu for file list items: Rename, Reset (if unsaved), Delete.
 */
export function FileListContextMenu({
  contextMenu,
  contextMenuRef,
  onRenameFile,
  hasUnsavedChanges,
  setConfirmState,
  setContextMenu,
  onStartRename,
  onDeleteFile,
}: FileListContextMenuProps) {
  if (!contextMenu) {
    return null
  }

  return (
    <div ref={contextMenuRef} className="fixed bg-[#252526] shadow-xl border border-[#3a3a3a] py-1 z-[100] min-w-[120px]" style={{ top: contextMenu.y, left: contextMenu.x }}>
      {onRenameFile && (
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors"
          onClick={() => onStartRename(contextMenu.path, contextMenu.name)}
        >
          Rename
        </button>
      )}
      {!contextMenu.isDirectory && hasUnsavedChanges(contextMenu.path) && (
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white transition-colors"
          onClick={() => {
            setConfirmState({ open: true, type: 'resetFile', path: contextMenu.path, name: contextMenu.name })
            setContextMenu(null)
          }}
        >
          Reset
        </button>
      )}
      {onDeleteFile && (
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-[#cccccc] hover:bg-[#ce3c3c] hover:text-white transition-colors"
          onClick={() => {
            setConfirmState({
              open: true,
              type: 'delete',
              path: contextMenu.path,
              name: contextMenu.name,
              isDirectory: contextMenu.isDirectory,
            })
            setContextMenu(null)
          }}
        >
          Delete
        </button>
      )}
    </div>
  )
}
