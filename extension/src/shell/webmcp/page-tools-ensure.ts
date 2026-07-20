import { isShellEnabledForTab } from '@ext/shared/extension-storage/shell-master-switch'
import { VWS_WEBMCP_PAGE_SCRIPT_KEY } from '@shared/webmcp/constants'

import { executeRawMainWorldCodeForTab, isUserScriptsApiAvailable } from '../csp-user-script-executor'
import { shouldRegisterPageTools } from './page-tools/page-tools-gate'
import { isOperableHttpTabUrl } from './webmcp-support'

let cachedPageToolsMainCode: string | null = null

async function loadPageToolsMainCode(): Promise<string> {
  if (cachedPageToolsMainCode != null) {
    return cachedPageToolsMainCode
  }
  const url = chrome.runtime.getURL('page-tools-main.js')
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load page-tools-main.js (${response.status})`)
  }
  cachedPageToolsMainCode = await response.text()
  return cachedPageToolsMainCode
}

/** Clear cached MAIN bundle (tests). */
export function clearPageToolsMainCodeCacheForTests(): void {
  cachedPageToolsMainCode = null
}

/**
 * Whether a tool name belongs to builtin page tools.
 */
export function isVwsPageToolName(name: string): boolean {
  return name.startsWith(`vws.${VWS_WEBMCP_PAGE_SCRIPT_KEY}.`)
}

export interface EnsurePageToolsForTabResult {
  attempted: boolean
  ok: boolean
  skippedReason?: string
  message?: string
  /** Canonical names reported by MAIN ensure when ok. */
  registered?: string[]
}

/**
 * Gate + inject page-tools MAIN bundle for a tab (idempotent in page).
 * Registers `vws.page.*` via WebMCP + `@page-agent/page-controller`.
 */
export async function ensurePageToolsForTab(tabId: number, tabUrl: string | undefined): Promise<EnsurePageToolsForTabResult> {
  const shellEnabled = await isShellEnabledForTab(tabId)
  const isHttpUrl = isOperableHttpTabUrl(tabUrl)
  const userScriptsAvailable = isUserScriptsApiAvailable()

  if (
    !shouldRegisterPageTools({
      shellEnabled,
      isHttpUrl,
      userScriptsAvailable,
    })
  ) {
    return {
      attempted: false,
      ok: true,
      skippedReason: !shellEnabled ? 'shell_disabled' : !isHttpUrl ? 'non_http_tab' : 'user_scripts_unavailable',
    }
  }

  try {
    const mainCode = await loadPageToolsMainCode()
    const invoke = `${mainCode}\n;(async () => {\n  const fn = globalThis.__VWS_ENSURE_PAGE_TOOLS__\n  if (typeof fn !== 'function') {\n    return { ok: false, reason: 'ensure_missing', message: 'page-tools-main did not expose __VWS_ENSURE_PAGE_TOOLS__' }\n  }\n  return await fn()\n})()`
    const inject = await executeRawMainWorldCodeForTab(tabId, invoke)
    if (!inject.ok) {
      return {
        attempted: true,
        ok: false,
        message: inject.message,
      }
    }

    const value = inject.value as { ok?: boolean; message?: string; registered?: string[]; reason?: string; already?: boolean } | null
    if (value && typeof value === 'object' && value.ok === false) {
      return {
        attempted: true,
        ok: false,
        message:
          typeof value.message === 'string'
            ? value.message
            : value.reason === 'unsupported'
              ? 'WebMCP is unavailable on this page. Enable chrome://flags/#enable-webmcp-testing and reload the tab.'
              : 'page tools ensure failed',
        registered: Array.isArray(value.registered) ? value.registered : undefined,
      }
    }

    return {
      attempted: true,
      ok: true,
      registered: value && Array.isArray(value.registered) ? value.registered : undefined,
    }
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
