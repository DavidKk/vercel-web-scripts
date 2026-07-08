/**
 * Page-level capability contract for `/editor`.
 * WebMCP tools may only call methods declared on {@link EditorPageHandle}.
 */

import type { ScriptOtaPolicy } from '@/shared/script-ota-policy'

/** Namespace keys that child components may mount via {@link useEditorPageSlot}. One registration per key; duplicates are rejected with a console warning. */
export type EditorPageSlot = 'session' | 'tabs' | 'buffer' | 'publish' | 'monaco' | 'ai' | 'rules' | 'layout' | 'devMode'

/** Tab summary for session and tabs tools. */
export interface EditorTabSummary {
  path: string
  hasUnsavedChanges: boolean
  isActive: boolean
}

/** Buffer snapshot for a single file. */
export interface EditorBufferSnapshot {
  filename: string
  content: string
  status: string
  hasUnsavedChanges: boolean
}

/** Layout snapshot for layout tools. */
export interface EditorLayoutSnapshot {
  leftPanelWidth: number
  rightPanelWidth: number
  rightPanel: 'ai' | 'rules' | null
}

/** Active script OTA summary. */
export interface EditorActiveOtaSnapshot {
  filename: string | null
  ota: ScriptOtaPolicy | null
}

/** Snapshot returned by {@link SessionSlot.getSnapshot}. */
export interface EditorSessionSnapshot {
  /** Stable page identifier (e.g. `editor`). */
  pageId: string
  /** Currently active tab path, if any. */
  activeTab: string | null
  /** Slot namespaces currently mounted by child components. */
  mountedSlots: EditorPageSlot[]
  /** Open tab summaries. */
  openTabs: EditorTabSummary[]
  /** Filenames with unsaved buffer changes. */
  dirtyFiles: string[]
  /** Right panel type when layout slot is mounted. */
  rightPanel: 'ai' | 'rules' | null
  /** Whether editor dev mode is enabled. */
  devModeEnabled: boolean
}

/** AI pending diff snapshot. */
export interface EditorAiPendingDiff {
  messageId: string
  instruction: string
  rewrittenContent: string | null
  error: string | null
}

/** Session namespace — editor-wide read-only context. */
export interface SessionSlot {
  /**
   * Return the current editor session snapshot.
   * @returns Session metadata for agents
   */
  getSnapshot(): EditorSessionSnapshot
  /**
   * Return OTA policy for the active managed script.
   * @returns Active script OTA snapshot
   */
  getActiveOta(): EditorActiveOtaSnapshot
}

/** Tabs namespace — open files and active tab. */
export interface TabsSlot {
  /** Open a file tab. */
  open(filename: string): void
  /** Switch to an open tab. */
  switchTo(filename: string): void
  /** List open tabs. */
  list(): EditorTabSummary[]
  /** Close a tab. */
  close(filename: string): void
  /** Close all tabs except the given one (defaults to active tab). */
  closeOthers(keepFilename?: string): void
}

/** Buffer namespace — in-memory editor content. */
export interface BufferSlot {
  getActive(): EditorBufferSnapshot | null
  get(filename: string): EditorBufferSnapshot | null
  apply(filename: string, content: string): void
  listDirty(): string[]
  /** Search/replace within a file buffer. */
  applyPatch(filename: string, search: string, replace: string, replaceAll?: boolean): void
  /** Revert buffer to last saved/original content. */
  discard(filename: string): void
  /** Create a new file and open its tab. */
  createFile(filename: string, content?: string): void
  /** Rename a file in buffer state. */
  renameFile(oldPath: string, newPath: string): void
  /** Mark a file deleted in buffer state. */
  deleteFile(filename: string): void
  /** Save active or specified file to IndexedDB (Cmd+S path). */
  saveLocal(filename?: string): Promise<void>
}

/** Publish namespace — compile and Gist publish. */
export interface PublishSlot {
  compile(filenames?: string[]): Promise<{ ok: boolean; message?: string }>
  publishDebug(): Promise<{ ok: boolean; message?: string }>
  publishStable(): Promise<{ ok: boolean; message?: string }>
}

/** Monaco namespace — editor surface. */
export interface MonacoSlot {
  navigateToLine(line: number): void
}

/** AI panel namespace. */
export interface AiSlot {
  isAvailable(): boolean
  rewrite(instruction: string): Promise<{ ok: boolean; messageId?: string; error?: string }>
  getPendingDiff(): EditorAiPendingDiff | null
  applyDiff(messageId?: string): { ok: boolean; error?: string }
  rejectDiff(messageId?: string): { ok: boolean }
}

/** Rules panel namespace. */
export interface RulesSlot {
  isAvailable(): boolean
  listForActiveScript(): Array<{ id: string; wildcard: string; script: string }>
  addRule(wildcard: string): { ok: boolean; ruleId?: string; error?: string }
  updateRule(ruleId: string, wildcard: string): { ok: boolean; error?: string }
  deleteRule(ruleId: string): { ok: boolean; error?: string }
}

/** Layout namespace — side panels. */
export interface LayoutSlot {
  togglePanel(type: 'ai' | 'rules'): void
  getRightPanel(): 'ai' | 'rules' | null
  getLayout(): EditorLayoutSnapshot
}

/** Dev mode namespace. */
export interface DevModeSlot {
  isEnabled(): boolean
  toggle(): void
  getStatus(): { enabled: boolean; hostId: string | null }
  pushToPreset(): Promise<{ ok: boolean; message?: string }>
}

/**
 * Aggregated page handle — always complete; missing slots use unavailable stubs.
 */
export interface EditorPageHandle {
  meta: {
    getPageId(): string
    listMountedSlots(): EditorPageSlot[]
  }
  session: SessionSlot
  tabs: TabsSlot
  buffer: BufferSlot
  publish: PublishSlot
  monaco: MonacoSlot
  ai: AiSlot
  rules: RulesSlot
  layout: LayoutSlot
  devMode: DevModeSlot
}
