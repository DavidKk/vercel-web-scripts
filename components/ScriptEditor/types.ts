/**
 * File status enumeration
 */
export enum FileStatus {
  /** File has no changes */
  Unchanged = 'unchanged',
  /** File has been modified but not saved */
  ModifiedUnsaved = 'modified-unsaved',
  /** File has been modified and saved */
  ModifiedSaved = 'modified-saved',
  /** New file that has not been saved */
  NewUnsaved = 'new-unsaved',
  /** New file that has been saved */
  NewSaved = 'new-saved',
  /** File has been deleted */
  Deleted = 'deleted',
}

/**
 * File content structure
 */
export interface FileContent {
  /** Original content from source */
  originalContent: string
  /** Modified content */
  modifiedContent: string
}

/**
 * File metadata
 */
export interface FileMetadata {
  /** File path */
  path: string
  /** File status */
  status: FileStatus
  /** File content */
  content: FileContent
  /** Last modified timestamp */
  updatedAt: number
}

/**
 * File state record
 */
export type FileStateRecord = Record<string, FileMetadata>
