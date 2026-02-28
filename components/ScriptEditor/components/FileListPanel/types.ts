/**
 * Shared row style for file list (tree nodes and "add file" row).
 * Use pixel values so row height is identical regardless of root font-size.
 * minHeight is content-area only (box-sizing: content-box); total row = paddingTop + minHeight + paddingBottom = 34px.
 */
export const FILE_LIST_ROW = {
  paddingTop: 6,
  paddingBottom: 6,
  paddingRight: 8,
  fontSize: '14px',
  lineHeight: '22px',
  /** Content-area min height (fits delete icon 22px); total row = 6 + 22 + 6 = 34px with or without icon. */
  minHeight: 22,
} as const

/**
 * File list panel props
 */
export interface FileListPanelProps {
  /** Selected file path */
  selectedFile: string | null
  /** Callback when file is selected */
  onSelectFile: (filePath: string) => void
  /** Callback when file is deleted */
  onDeleteFile?: (filePath: string) => void
  /** Callback when new file is added */
  onAddFile?: (filePath: string) => void
  /** Callback when file is renamed */
  onRenameFile?: (oldPath: string, newPath: string) => void
  /** Whether files are loading from storage */
  isLoading?: boolean
  /** Callback to clear local IndexedDB and reload from online (online as source of truth) */
  onResetToOnline?: () => void | Promise<void>
  /** When true, header actions (reset to online, add file) are disabled (e.g. local map mode) */
  readOnly?: boolean
}

/**
 * File node structure
 */
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children: Map<string, FileNode>
}

/** Context menu position and target */
export interface FileListContextMenuState {
  x: number
  y: number
  path: string
  name: string
  isDirectory: boolean
}

/** Confirm dialog state (reset to online, delete, reset file) */
export type FileListConfirmState =
  | { open: false }
  | { open: true; type: 'resetToOnline' }
  | { open: true; type: 'delete'; path: string; name: string; isDirectory: boolean }
  | { open: true; type: 'resetFile'; path: string; name: string }
