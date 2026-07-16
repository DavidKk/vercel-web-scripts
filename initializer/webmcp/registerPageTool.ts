import { rememberVwsWebMcpPageToolHint } from '@shared/webmcp/page-tool-hints'

import type { WebMcpToolDefinition } from './modelContext'
import { getDocumentModelContext } from './modelContext'

const registeredToolNames = new Set<string>()
let activePageRegistrationId: string | null = null

/**
 * Assert that only one page WebMCP registrar is active (dev guard).
 * @param pageId Page registration id
 */
export function assertPageLevelWebMcpRegistration(pageId: string): void {
  if (process.env.NODE_ENV !== 'development') {
    return
  }

  if (activePageRegistrationId && activePageRegistrationId !== pageId) {
    throw new Error(`[WebMCP] Only one page registrar allowed; active="${activePageRegistrationId}", attempted="${pageId}"`)
  }

  activePageRegistrationId = pageId
}

/**
 * Release the page-level WebMCP registration lock.
 * @param pageId Page registration id
 */
export function releasePageLevelWebMcpRegistration(pageId: string): void {
  if (activePageRegistrationId === pageId) {
    activePageRegistrationId = null
  }
}

/**
 * Register one WebMCP tool for a page (deduped by tool name).
 * @param pageId Page id for diagnostics
 * @param definition Tool definition
 * @param signal Abort signal that unregisters the tool
 */
export async function registerPageTool(pageId: string, definition: WebMcpToolDefinition, signal: AbortSignal): Promise<void> {
  if (registeredToolNames.has(definition.name)) {
    throw new Error(`[WebMCP] duplicate tool on page "${pageId}": ${definition.name}`)
  }

  const modelContext = getDocumentModelContext()
  if (!modelContext) {
    return
  }

  registeredToolNames.add(definition.name)
  signal.addEventListener(
    'abort',
    () => {
      registeredToolNames.delete(definition.name)
    },
    { once: true }
  )

  // Chromium listTools often drops annotations; stash readOnlyHint for the extension Agent.
  rememberVwsWebMcpPageToolHint(definition.name, definition.annotations?.readOnlyHint === true, signal)

  await modelContext.registerTool(definition, { signal })
}

/**
 * Register all tools for a page registrar lifecycle.
 * @param pageId Page id
 * @param tools Tool definitions
 * @param signal Shared abort signal for the whole page
 */
export async function registerPageTools(pageId: string, tools: WebMcpToolDefinition[], signal: AbortSignal): Promise<void> {
  await Promise.all(tools.map((tool) => registerPageTool(pageId, tool, signal)))
}
