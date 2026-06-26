/** http(s) pages and this extension's own pages (scripts/servers) can be reloaded. */
export function isReloadableTabUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return true
  }
  return url.startsWith(chrome.runtime.getURL(''))
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  return tabs[0]
}

export async function reloadTab(tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (tab?.id == null || !isReloadableTabUrl(tab.url)) {
    return
  }
  await chrome.tabs.reload(tab.id)
}

export async function reloadAllReloadableTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({})
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null || !isReloadableTabUrl(tab.url)) {
        return
      }
      await chrome.tabs.reload(tab.id)
    })
  )
}
