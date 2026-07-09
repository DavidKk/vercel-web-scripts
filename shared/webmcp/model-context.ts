import type { DocumentModelContext } from './types'

/**
 * Resolve WebMCP model context when the browser supports it.
 * @returns Model context or null
 */
export function getDocumentModelContext(): DocumentModelContext | null {
  if (typeof document === 'undefined') {
    return null
  }

  const documentModelContext = (document as Document & { modelContext?: DocumentModelContext }).modelContext
  if (documentModelContext && typeof documentModelContext.registerTool === 'function') {
    return documentModelContext
  }

  if (typeof navigator !== 'undefined') {
    const navigatorModelContext = (navigator as Navigator & { modelContext?: DocumentModelContext }).modelContext
    if (navigatorModelContext && typeof navigatorModelContext.registerTool === 'function') {
      return navigatorModelContext
    }
  }

  return null
}

/**
 * Whether WebMCP imperative API is available in this browser tab.
 * @returns True when `registerTool` exists
 */
export function isWebMcpSupported(): boolean {
  return getDocumentModelContext() !== null
}
