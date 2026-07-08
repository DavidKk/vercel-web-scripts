/**
 * Editor WebMCP — page contract, slot mounting, and smoke-test host.
 * Registry machinery lives in `@/initializer/webmcp`.
 */

export type {
  AiSlot,
  BufferSlot,
  DevModeSlot,
  EditorActiveOtaSnapshot,
  EditorAiPendingDiff,
  EditorBufferSnapshot,
  EditorLayoutSnapshot,
  EditorPageHandle,
  EditorPageSlot,
  EditorSessionSnapshot,
  EditorTabSummary,
  LayoutSlot,
  MonacoSlot,
  PublishSlot,
  RulesSlot,
  SessionSlot,
  TabsSlot,
} from './EditorPageHandle'
export { EditorPageHandleProvider, useEditorPageHandleContext, useEditorPageSlot, useOptionalEditorPageHandleContext, useOptionalEditorPageSlot } from './editorPageHandleSystem'
export { EditorPageSlotUnavailableError } from './EditorPageSlotUnavailableError'
export { EditorPageWebMcpHost } from './EditorPageWebMcpHost'
export { isWebMcpSupported } from '@/initializer/webmcp'
