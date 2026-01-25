'use client'

/**
 * Type definitions for the ScriptEditor-specific InternalCodeEditor
 */

export interface ExtraLib {
  content: string
  filePath: string
}

export interface CodeEditorRef {
  /** Navigate to a specific line number */
  navigateToLine: (lineNumber: number) => void
  /** Set editor content (for file switching) */
  setContent: (content: string, forceUpdate?: boolean) => Promise<void>
  /** Get current editor content */
  getContent: () => string
  /** Check if editor is ready */
  isReady: () => boolean
}

export interface InternalCodeEditorProps {
  defaultValue: string
  path?: string
  language?: 'javascript' | 'typescript' | 'json' | 'css' | 'less' | 'scss' | 'html' | 'markdown'
  onChange?: (content: string) => void
  onSave?: () => void
  onDelete?: () => void
  onValidate?: (hasError: boolean) => void
  readOnly?: boolean
  extraLibs?: ExtraLib[]
  /** Ref to expose editor methods */
  editorRef?: React.RefObject<CodeEditorRef | null>
  /** Diff mode: show diff between original and modified content */
  diffMode?: {
    original: string
    modified: string
    onAccept?: () => void
    onReject?: () => void
  }
  /** Callback when editor is ready */
  onReady?: () => void
}
