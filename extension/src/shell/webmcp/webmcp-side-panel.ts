import { WEBMCP_OPEN_SIDE_PANEL_COMMAND } from './webmcp-types'

/**
 * Open the Agent side panel inside a user-gesture handler (popup click, context menu).
 * Must call `chrome.sidePanel.open` synchronously — no `await` before it or Chrome drops the gesture.
 */
export function openAgentSidePanelFromUserGesture(): Promise<void> {
  return chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
}

/**
 * Open the Agent side panel for the last-focused browser window.
 * Used from background command handlers where Chrome preserves the shortcut gesture.
 */
export async function openAgentSidePanelForActiveWindow(): Promise<void> {
  const window = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
  if (window.id == null) {
    return
  }
  await chrome.sidePanel.open({ windowId: window.id })
}

/**
 * Register Chrome command listener for opening the Agent side panel.
 */
export function registerWebMcpSidePanelCommandListener(): void {
  chrome.commands.onCommand.addListener((command) => {
    if (command === WEBMCP_OPEN_SIDE_PANEL_COMMAND) {
      void openAgentSidePanelFromUserGesture().catch(() => {
        void openAgentSidePanelForActiveWindow()
      })
    }
  })
}
