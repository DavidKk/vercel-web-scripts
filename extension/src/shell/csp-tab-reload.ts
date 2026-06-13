const CSP_RELOAD_SESSION_PREFIX = 'vws_csp_reload:'

function sessionKey(tabId: number, url: string): string {
  return `${CSP_RELOAD_SESSION_PREFIX}${tabId}:${url}`
}

/**
 * Reload the tab once per URL so DNR-stripped CSP allows page-world preset eval on the next load.
 */
export async function reloadTabOnceForCsp(tabId: number, url: string): Promise<'reloaded' | 'already-reloaded'> {
  const key = sessionKey(tabId, url)
  const stored = await chrome.storage.session.get(key)
  if (stored[key]) {
    return 'already-reloaded'
  }
  await chrome.storage.session.set({ [key]: true })
  await chrome.tabs.reload(tabId)
  return 'reloaded'
}
