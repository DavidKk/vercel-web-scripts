'use client'

import { useEditorPageWebMcp } from './useEditorPageWebMcp'

const EDITOR_PAGE_ID = 'editor'

/**
 * Mount page-level WebMCP tool registration for `/editor`.
 * Slot implementations are owned by child components (see §5.1 in editor-webmcp.md).
 * @returns Null render
 */
export function EditorPageWebMcpHost() {
  useEditorPageWebMcp(EDITOR_PAGE_ID)
  return null
}
