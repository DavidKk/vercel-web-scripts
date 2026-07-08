/** WebMCP tool definition passed to `document.modelContext.registerTool`. */
export interface WebMcpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown
  annotations?: {
    readOnlyHint?: boolean
  }
}

/** Tool metadata returned by `document.modelContext.getTools()`. */
export interface WebMcpRegisteredToolInfo {
  name: string
  description?: string
  origin?: string
}

/** Minimal `document.modelContext` surface used by the page registrar. */
export interface DocumentModelContext {
  registerTool: (definition: WebMcpToolDefinition, options?: { signal?: AbortSignal }) => Promise<unknown>
  getTools?: (options?: { fromOrigins?: string[] }) => Promise<WebMcpRegisteredToolInfo[]>
}

/** Diagnostic report for WebMCP feature availability in the current tab. */
export interface WebMcpSupportReport {
  /** Whether `registerTool` can be called in this tab. */
  supported: boolean
  /** Short machine-readable reason code. */
  reason: 'supported' | 'no_secure_context' | 'api_missing' | 'no_document'
  /** Human-readable hints for developers. */
  hints: string[]
  details: {
    isSecureContext: boolean
    hasDocumentModelContext: boolean
    hasNavigatorModelContext: boolean
    hasRegisterTool: boolean
    origin: string | null
  }
}

/**
 * Resolve WebMCP model context when the browser supports it.
 * Falls back to deprecated `navigator.modelContext` on older Chromium builds.
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

/**
 * Explain why WebMCP is or is not available in the current tab.
 * @returns Support report for diagnostics and dev logging
 */
export function getWebMcpSupportReport(): WebMcpSupportReport {
  if (typeof document === 'undefined') {
    return {
      supported: false,
      reason: 'no_document',
      hints: ['WebMCP 只能在浏览器 Tab 内注册，不能在 SSR 环境执行。'],
      details: {
        isSecureContext: false,
        hasDocumentModelContext: false,
        hasNavigatorModelContext: false,
        hasRegisterTool: false,
        origin: null,
      },
    }
  }

  const isSecureContext = typeof window !== 'undefined' ? window.isSecureContext : false
  const hasDocumentModelContext = 'modelContext' in document
  const hasNavigatorModelContext = typeof navigator !== 'undefined' && 'modelContext' in navigator
  const hasRegisterTool = isWebMcpSupported()
  const origin = typeof window !== 'undefined' ? window.location.origin : null

  if (!isSecureContext) {
    return {
      supported: false,
      reason: 'no_secure_context',
      hints: ['WebMCP 需要 Secure Context（HTTPS 或 localhost）。'],
      details: {
        isSecureContext,
        hasDocumentModelContext,
        hasNavigatorModelContext,
        hasRegisterTool,
        origin,
      },
    }
  }

  if (!hasRegisterTool) {
    return {
      supported: false,
      reason: 'api_missing',
      hints: [
        '当前 Tab 没有 `document.modelContext.registerTool`。',
        'Chrome DevTools 的「应用 → WebMCP」面板存在，不代表页面 API 已启用。',
        '请在 Chrome 打开 `chrome://flags/#enable-webmcp-testing` 并设为 Enabled，然后完全重启浏览器。',
        '需要 Chromium 146.0.7672+（建议 Chrome 150+）。',
        '重启后访问 `/editor`，在控制台执行：`document.modelContext?.getTools?.()` 应返回工具列表。',
      ],
      details: {
        isSecureContext,
        hasDocumentModelContext,
        hasNavigatorModelContext,
        hasRegisterTool,
        origin,
      },
    }
  }

  return {
    supported: true,
    reason: 'supported',
    hints: [],
    details: {
      isSecureContext,
      hasDocumentModelContext,
      hasNavigatorModelContext,
      hasRegisterTool,
      origin,
    },
  }
}
