import type { WebMcpToolDefinition } from '@/initializer/webmcp'

import type { EditorPageHandle } from '../EditorPageHandle'
import { buildEditorP0Tools } from './p0Tools'
import { buildEditorP1Tools } from './p1Tools'

type GetHandle = () => EditorPageHandle

/**
 * Build all editor WebMCP tools (P0 + P1 main-flow).
 * @param getHandle Resolver for the aggregated page handle
 * @returns Tool definitions for WebMCP registration
 */
export function buildEditorTools(getHandle: GetHandle): WebMcpToolDefinition[] {
  return [...buildEditorP0Tools(getHandle), ...buildEditorP1Tools(getHandle)]
}
