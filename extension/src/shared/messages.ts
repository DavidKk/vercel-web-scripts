import type { ShellLogOutputMode } from '@shared/shell-log-output'

import type { DebugLogAppendInput, DebugLogEntry } from './debug-log-types'

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
  | { type: 'SET_SHELL_ENABLED'; enabled: boolean; scope?: 'tab' | 'global' }
  | { type: 'GET_SHELL_ENABLED_FOR_SENDER' }
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
  | { type: 'APPEND_DEBUG_LOG'; details: DebugLogAppendInput | { entries: DebugLogAppendInput[] } }
  | { type: 'GET_DEBUG_LOGS' }
  | { type: 'GET_INCOGNITO_LOG_COLLECTION' }
  | { type: 'SET_INCOGNITO_LOG_COLLECTION'; enabled: boolean }
  | { type: 'CLEAR_DEBUG_LOGS' }
  | { type: 'EXECUTE_USER_SCRIPT'; details: { mode: 'preset'; decls: string; presetCode: string } | { mode: 'global'; withBody: string } }

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
  /** True when server reports a newer extension semver than installed. */
  extensionUpdateAvailable: boolean
  /** Latest extension semver from server when check succeeded. */
  latestExtensionVersion: string | null
  /** Absolute ZIP download URL when server check succeeded. */
  extensionDownloadUrl: string | null
  /** Project version last reported by preset on an http(s) tab; null before first page load. */
  presetVersion: string | null
  /** False when master switch is off globally or for the active tab. */
  shellEnabledOnActiveTab: boolean
  /** False when master switch is off for all tabs. */
  shellGloballyEnabled: boolean
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
  | { ok: true; shellEnabled?: boolean }
  | { ok: true; debugLogs?: DebugLogEntry[] }
  | { ok: true; incognitoLogCollection?: boolean }
  | { ok: false; error: string }

export async function sendShellMessage(message: ShellMessage): Promise<ShellResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ShellResponse>
}
