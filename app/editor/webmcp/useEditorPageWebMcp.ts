'use client'

import { usePageWebMcp } from '@/initializer/webmcp'

import { useEditorPageHandleContext } from './editorPageHandleSystem'
import { buildEditorTools } from './tools/editorTools'

/**
 * Register all editor-page WebMCP tools once per `/editor` mount.
 * @param pageId Stable page id passed to the handle provider
 */
export function useEditorPageWebMcp(pageId: string): void {
  const { getHandle } = useEditorPageHandleContext()

  usePageWebMcp(pageId, () => buildEditorTools(getHandle))
}
