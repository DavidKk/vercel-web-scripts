import { FileStateProvider } from './context/FileStateContext'
import { LayoutProvider } from './context/LayoutContext'
import { TabBarProvider } from './context/TabBarContext'
import { ScriptEditorContent } from './ScriptEditorContent'

export interface ScriptEditorProps {
  /** Unique key for file storage */
  storageKey: string
  /** Unique key for layout storage */
  layoutStorageKey?: string
  /** Initial files fallback */
  initialFiles?: Record<string, string>
  /** Extra type definitions for the editor */
  extraLibs?: Array<{ content: string; filePath: string }>
  /** Title to display in the header */
  title?: React.ReactNode
  /** Custom header or toolbar elements */
  headerActions?: React.ReactNode
  /** Custom footer elements */
  footerInfo?: React.ReactNode
  /** Class name for the container */
  className?: string
  /** Whether to hide the default header */
  hideHeader?: boolean
  /** Whether to hide the default footer */
  hideFooter?: boolean
  /** Whether to show file count in header */
  showFileCount?: boolean
  /** Callback when a file is saved */
  onSave?: (path: string, content: string) => void | Promise<void>
  /** Callback when a file is deleted */
  onDelete?: (path: string) => void | Promise<void>
  /** Callback when editor is ready */
  onReady?: () => void
  /** Render function for the right-side panel content */
  renderRightPanel?: (panelType: string) => React.ReactNode
  /** When true, editor and file list are read-only (e.g. local map mode) */
  readOnly?: boolean
  /** Optional callback for local map notifications (success/error/warning) */
  onLocalMapNotify?: (type: 'success' | 'error' | 'warning', message: string) => void
  /** Optional typings (e.g. GME_*, GM_*) to write as gm-globals.d.ts when mapping to local */
  typingsForLocal?: string
  /** Optional callback when local files were synced (content changed and saved). E.g. trigger editor dev mode push. */
  onLocalFilesSynced?: () => void
}

/**
 * ScriptEditor unified entry component
 * Encapsulates File List, Tab Bar, and Code Editor with state management
 */
export function ScriptEditor(props: ScriptEditorProps) {
  // Wrap with necessary providers to ensure state is managed
  return (
    <FileStateProvider initialFiles={props.initialFiles}>
      <LayoutProvider storageKey={props.layoutStorageKey}>
        <TabBarProvider>
          <ScriptEditorContent {...props} />
        </TabBarProvider>
      </LayoutProvider>
    </FileStateProvider>
  )
}
