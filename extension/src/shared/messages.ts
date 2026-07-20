import type {
  ScriptPermissionAdminPolicy,
  ScriptPermissionCapability,
  ScriptPermissionContext,
  ScriptPermissionDecision,
  ScriptPermissionRegistryEntry,
  ScriptPermissionRemember,
  ScriptPermissionRequest,
} from '@shared/script-permission'
import type { ShellLogOutputMode } from '@shared/shell-log-output'

import type { RuntimeLoadResult } from '../runtime/loader-types'
import type { PermissionModalResultPayload } from '../shell/permission-manager'
import type { AgentLlmGenerateResult, AgentLlmMessage, AgentLlmModelInfo, AgentLlmToolDefinition } from '../shell/webmcp/agent-types'
import type { WebMcpProxyResult } from '../shell/webmcp/webmcp-types'
import type { DebugLogAppendInput, DebugLogEntry } from './debug-log-types'

/** Background ↔ popup/content message types (MVP). */
export interface BridgeXhrDetails {
  method?: string
  url: string
  headers?: Record<string, string>
  data?: string
  timeout?: number
  responseType?: 'arraybuffer' | 'blob' | 'json' | 'stream' | 'text'
  /** Permission context verified in background before fetch (defense in depth). */
  permission?: ScriptPermissionRequest
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
  | { type: 'GET_STATUS'; network?: boolean }
  | { type: 'SET_NETWORK'; enabled: boolean }
  | { type: 'SET_SHELL_ENABLED'; enabled: boolean; scope?: 'tab' | 'global' }
  | { type: 'GET_SHELL_ENABLED_FOR_SENDER' }
  | { type: 'SYNC_CLOUDFLARE_CHALLENGE_SHELL_DISABLE'; details: { url: string } }
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
  | { type: 'SCRIPT_PERMISSION_ENSURE'; request: ScriptPermissionRequest }
  | { type: 'GET_SCRIPT_PERMISSION_REGISTRY' }
  | { type: 'GET_PAGE_PERMISSION_ALLOW_KEYS' }
  | { type: 'CLEAR_ALL_SCRIPT_PERMISSIONS' }
  | { type: 'REMOVE_SCRIPT_PERMISSION_ENTRY'; key: string }
  | { type: 'REMOVE_SESSION_PERMISSION_ENTRY'; tabId: number; key: string }
  | {
      type: 'UPDATE_SCRIPT_PERMISSION_ENTRY'
      registryKey: string
      request: ScriptPermissionRequest
      scope: 'persistent' | 'session'
      tabId?: number
      decision: ScriptPermissionDecision
      policy?: ScriptPermissionAdminPolicy
    }
  | {
      type: 'UPDATE_SCRIPT_PERMISSION_ENTRIES'
      updates: Array<{
        registryKey: string
        request: ScriptPermissionRequest
        scope: 'persistent' | 'session'
        tabId?: number
        decision: ScriptPermissionDecision
        policy?: ScriptPermissionAdminPolicy
      }>
    }
  | {
      type: 'SCRIPT_PERMISSION_SEED_CONNECTS'
      context: ScriptPermissionContext
      connects: string[]
    }
  | {
      type: 'SCRIPT_PERMISSION_SEED_TRUST_TIER1'
      context: ScriptPermissionContext
    }
  | {
      type: 'DEBUG_PERMISSION_PROMPT'
      details: {
        capability: ScriptPermissionCapability
        resource: string
        file?: string
        scriptKey?: string
        batch?: boolean
        /** `http` = storefront tab (default); `sender` = tab that sent this message (e.g. admin). */
        target?: 'http' | 'sender'
        focusTab?: boolean
        forcePrompt?: boolean
      }
    }
  | { type: 'DEBUG_CLEAR_TAB_SESSION_PERMISSIONS' }
  | {
      type: 'DEBUG_RUN_GM_PERMISSION_TEST'
      details?: {
        resource?: string
        file?: string
        scriptKey?: string
        /** Defaults to `xhr`. */
        test?: 'xhr' | 'clipboard-write' | 'clipboard-read'
        text?: string
        focusTab?: boolean
      }
    }
  | { type: 'VWS_PERMISSION_MODAL_RESULT'; payload: PermissionModalResultPayload }
  | { type: 'GM_XHR'; details: BridgeXhrDetails }
  | {
      type: 'CAPTURE_VISIBLE_TAB'
      options: { format?: 'png' | 'jpeg'; quality?: number }
      permission?: ScriptPermissionRequest
    }
  | { type: 'WEB_CONNECT_EXTENSION'; details: WebConnectDetails }
  | { type: 'TAB_PAGE_LOAD'; details: { url: string } }
  | { type: 'PAGE_BOOTSTRAP_READY'; details: { url: string } }
  | { type: 'PAGE_BOOTSTRAP_SKIPPED'; details: { url: string; reason: 'no-config' | 'non-html' } }
  | { type: 'SCRIPT_TRIGGERED'; details: ScriptTriggeredDetails }
  | { type: 'SCRIPT_FAILED'; details: ScriptTriggeredDetails }
  | { type: 'APPEND_DEBUG_LOG'; details: DebugLogAppendInput | { entries: DebugLogAppendInput[] } }
  | { type: 'GET_DEBUG_LOGS' }
  | { type: 'GET_INCOGNITO_LOG_COLLECTION' }
  | { type: 'SET_INCOGNITO_LOG_COLLECTION'; enabled: boolean }
  | { type: 'CLEAR_DEBUG_LOGS' }
  | { type: 'EXECUTE_USER_SCRIPT'; details: { mode: 'preset'; decls: string; presetCode: string } | { mode: 'global'; withBody: string } }
  | { type: 'ENSURE_CSP_STRIP_RELOAD_FOR_INJECTION'; details: { pageUrl: string } }
  | {
      type: 'RUNTIME_ENSURE_LOAD'
      details: {
        pageUrl: string
        entries: Array<{
          scriptKey: string
          baseUrl: string
          gmScope: string
          developMode: boolean
          enabledScripts: Record<string, boolean>
          acceptAlphaByFile?: Record<string, boolean>
          acceptAlpha?: boolean
          contentHashByFile?: Record<string, string>
        }>
      }
    }
  | { type: 'OPEN_SIDE_PANEL' }
  | { type: 'WEBMCP_GET_SUPPORT'; tabId: number }
  | { type: 'WEBMCP_LIST_TOOLS'; tabId: number }
  | { type: 'WEBMCP_EXECUTE_TOOL'; tabId: number; name: string; args: Record<string, unknown> }
  | { type: 'WEBMCP_LIST_CANDIDATE_TABS' }
  | {
      type: 'AGENT_LLM_GENERATE'
      requestId: string
      messages: AgentLlmMessage[]
      tools?: AgentLlmToolDefinition[]
    }
  | {
      type: 'AGENT_LLM_LIST_MODELS'
      /** Optional unsaved API key from the settings form. */
      apiKey?: string
      /** Optional unsaved proxy toggle from the settings form. */
      proxyEnabled?: boolean
      /** Optional unsaved proxy base URL from the settings form. */
      baseUrl?: string
      /** Optional unsaved custom proxy headers from the settings form. */
      proxyHeaders?: Record<string, string>
      /** Optional unsaved provider from the settings form. */
      provider?: 'gemini' | 'openai' | 'anthropic' | 'ollama'
    }

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
  /** Runtime OTA stage (stable | alpha) from launcher or manifest; null when unknown. */
  runtimeStage: 'stable' | 'alpha' | null
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
  | { ok: true; dataUrl: string }
  | { ok: true; quickAddRuleContext?: { activeTabUrl: string; items: QuickAddRuleContextItem[] } }
  | { ok: true; shellEnabled?: boolean }
  | { ok: true; debugLogs?: DebugLogEntry[] }
  | { ok: true; incognitoLogCollection?: boolean }
  | { ok: true; allowed?: boolean }
  | { ok: true; permissionAllowKeys?: string[] }
  | { ok: true; grantedKeys?: string[] }
  | {
      ok: true
      scriptPermissionEntries?: Array<{
        key: string
        request: ScriptPermissionRequest
        entry: ScriptPermissionRegistryEntry
      }>
      sessionPermissionEntries?: Array<{
        tabId: number
        key: string
        request: ScriptPermissionRequest | null
        decision: ScriptPermissionDecision
      }>
      permissionHistoryEntries?: Array<{
        id: string
        tabId: number
        key: string
        request: ScriptPermissionRequest
        decision: ScriptPermissionDecision
        remember: ScriptPermissionRemember
        decidedAt: number
      }>
    }
  | { ok: true; removed?: boolean }
  | { ok: true; runtimeLoadResults?: RuntimeLoadResult[] }
  | { ok: true; cspReloadScheduled?: boolean }
  | { ok: true; webmcp?: WebMcpProxyResult<unknown> }
  | { ok: true; agentLlm?: AgentLlmGenerateResult }
  | { ok: true; agentLlmModels?: AgentLlmModelInfo[] }
  | { ok: false; error: string }

export async function sendShellMessage(message: ShellMessage): Promise<ShellResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ShellResponse>
}
