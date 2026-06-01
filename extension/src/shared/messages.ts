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
}

export type ShellMessage =
  | { type: 'GET_STATUS' }
  | { type: 'SET_NETWORK'; enabled: boolean }
  | { type: 'UPDATE_RUNTIME' }
  | { type: 'RESET_RUNTIME' }
  | { type: 'OPEN_EDITOR' }
  | { type: 'OPEN_SCRIPTS_PAGE' }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'RELOAD_ACTIVE_TAB' }
  | { type: 'SYNC_RULES' }
  | { type: 'GM_XHR'; details: BridgeXhrDetails }
  | { type: 'WEB_CONNECT_EXTENSION'; details: WebConnectDetails }
  | { type: 'TAB_PAGE_LOAD'; details: { url: string } }
  | { type: 'SCRIPT_TRIGGERED'; details: ScriptTriggeredDetails }
  | { type: 'SCRIPT_FAILED'; details: ScriptTriggeredDetails }

export interface ShellStatus {
  configured: boolean
  baseUrl: string
  scriptKey: string
  networkEnabled: boolean
  /** Scripts that actually executed on the active tab for the current URL (not RULE match count). */
  triggeredCountOnActiveTab: number
  activeTabUrl: string
  extensionVersion: string
}

export type ShellResponse = { ok: true; status?: ShellStatus } | { ok: true; message?: string } | { ok: true; xhr: BridgeXhrResponse } | { ok: false; error: string }

export async function sendShellMessage(message: ShellMessage): Promise<ShellResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ShellResponse>
}
