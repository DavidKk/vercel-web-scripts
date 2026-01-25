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
