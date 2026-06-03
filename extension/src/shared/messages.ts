import type { ShellLogOutputMode } from '@shared/shell-log-output'

/** Background ↔ popup/content message types (MVP). */
export interface BridgeXhrDetails {
  method?: string
  url: string
  headers?: Record<string, string>
  data?: string
  timeout?: number
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
}

export interface BridgeXhrResponse {
  status: number
  statusText: string
  responseText: string
  responseHeaders?: string
  finalUrl?: string
}

export interface WebConnectDetails {
  baseUrl: string
  scriptKey: string
  developMode?: boolean
}

export interface ScriptTriggeredDetails {
  file: string
  runAt: string
  url: string
  /** Capability scriptKey; used for multi-scriptKey dedupe. */
  scriptKey?: string
}

export interface QuickAddRuleContextItem {
  scriptKey: string
  serviceLabels: string[]
  scripts: Array<{ file: string; name: string; matchedOnActiveTab?: boolean }>
}

export type ShellMessage =
  | { type: 'GET_STATUS' }
  | { type: 'SET_NETWORK'; enabled: boolean }
  | { type: 'SET_LOG_OUTPUT_MODE'; mode: ShellLogOutputMode }
  | { type: 'UPDATE_RUNTIME' }
  | { type: 'RESET_RUNTIME' }
  | { type: 'OPEN_EDITOR' }
  | { type: 'OPEN_SCRIPTS_PAGE' }
  | { type: 'OPEN_RULES_PAGE' }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'RELOAD_ACTIVE_TAB' }
  | { type: 'SYNC_RULES' }
  | { type: 'GET_QUICK_ADD_RULE_CONTEXT' }
  | { type: 'GET_LOCAL_RULES' }
  | { type: 'ADD_LOCAL_RULE'; details: { scriptKey: string; script: string; wildcard: string; mode: 'include' | 'exclude' } }
  | { type: 'REMOVE_LOCAL_RULE'; details: { scriptKey: string; script: string; wildcard: string; mode: 'include' | 'exclude' } }
  | { type: 'GM_XHR'; details: BridgeXhrDetails }
  | { type: 'WEB_CONNECT_EXTENSION'; details: WebConnectDetails }
  | { type: 'TAB_PAGE_LOAD'; details: { url: string } }
  | { type: 'SCRIPT_TRIGGERED'; details: ScriptTriggeredDetails }
  | { type: 'SCRIPT_FAILED'; details: ScriptTriggeredDetails }

export interface ShellStatus {
  configured: boolean
  /** Primary OTA representative baseUrl (legacy field). */
  baseUrl: string
  /** Primary enabled scriptKey (legacy field). */
  scriptKey: string
  enabledServiceCount: number
  enabledScriptKeyCount: number
  /** Per-file enabled scripts across all enabled scriptKeys (Manage scripts toggles). */
  enabledScriptCount: number
  networkEnabled: boolean
  /** console | logviewer | none */
  logOutputMode: ShellLogOutputMode
  /** Scripts that actually executed on the active tab for the current URL (not RULE match count). */
  triggeredCountOnActiveTab: number
  activeTabUrl: string
  extensionVersion: string
}

export type ShellResponse =
  | { ok: true; status?: ShellStatus }
  | { ok: true; message?: string }
  | { ok: true; ruleMutation?: { created?: boolean; removed?: boolean } }
  | {
      ok: true
      localRules?: Array<{
        id: string
        scriptKey: string
        script: string
        scriptName: string
        scriptFile: string
        wildcard: string
        mode: 'include' | 'exclude'
      }>
    }
  | { ok: true; xhr: BridgeXhrResponse }
  | { ok: true; quickAddRuleContext?: { activeTabUrl: string; items: QuickAddRuleContextItem[] } }
  | { ok: false; error: string }

export async function sendShellMessage(message: ShellMessage): Promise<ShellResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ShellResponse>
}
