/** Background ↔ popup/content message types (MVP). */
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

export interface ShellStatus {
  configured: boolean
  baseUrl: string
  scriptKey: string
  networkEnabled: boolean
  matchCountOnActiveTab: number
  activeTabUrl: string
  extensionVersion: string
}

export type ShellResponse = { ok: true; status?: ShellStatus } | { ok: true; message?: string } | { ok: false; error: string }

export async function sendShellMessage(message: ShellMessage): Promise<ShellResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ShellResponse>
}
