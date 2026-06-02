/**
 * Focus an existing tab for the given URL, or open one. Closes duplicate tabs for the same URL.
 * @param url - Full tab URL to match
 */
export async function focusOrOpenTab(url: string): Promise<void> {
  const matches = await chrome.tabs.query({ url })
  const withId = matches.filter((t): t is chrome.tabs.Tab & { id: number } => t.id != null)

  if (withId.length > 0) {
    const [primary, ...duplicates] = withId
    await chrome.tabs.update(primary.id, { active: true })
    if (primary.windowId != null) {
      await chrome.windows.update(primary.windowId, { focused: true })
    }
    if (duplicates.length > 0) {
      await chrome.tabs.remove(duplicates.map((t) => t.id))
    }
    return
  }

  await chrome.tabs.create({ url })
}

/**
 * Navigate the current tab to an extension page (same tab, no new tab).
 * @param pagePath - Path under extension root, optionally with hash, e.g. `rules.html#script/...`
 */
export function navigateExtensionPage(pagePath: string): void {
  const hashIndex = pagePath.indexOf('#')
  const path = hashIndex >= 0 ? pagePath.slice(0, hashIndex) : pagePath
  const hash = hashIndex >= 0 ? pagePath.slice(hashIndex) : ''
  const targetPath = chrome.runtime.getURL(path)
  const currentFile = location.pathname.split('/').pop() ?? ''

  if (currentFile === path) {
    if (hash) {
      if (location.hash !== hash) {
        location.hash = hash.slice(1)
      }
    } else if (location.hash) {
      history.replaceState(null, '', targetPath)
    }
    return
  }

  location.assign(`${targetPath}${hash}`)
}

/**
 * Focus an existing extension page tab, or open it.
 * @param pagePath - Path under extension root, e.g. `scripts.html`
 */
export async function focusOrOpenExtensionPage(pagePath: string): Promise<void> {
  const hashIndex = pagePath.indexOf('#')
  const path = hashIndex >= 0 ? pagePath.slice(0, hashIndex) : pagePath
  const hash = hashIndex >= 0 ? pagePath.slice(hashIndex) : ''
  await focusOrOpenTab(`${chrome.runtime.getURL(path)}${hash}`)
}

/**
 * Focus an existing extension page popup window, or open one.
 * @param pagePath - Path under extension root, e.g. `rules.html`
 * @param size - Popup window size
 */
export async function focusOrOpenExtensionPopupPage(pagePath: string, size: { width: number; height: number } = { width: 420, height: 620 }): Promise<void> {
  const targetUrl = chrome.runtime.getURL(pagePath)
  const tabs = await chrome.tabs.query({ url: targetUrl })
  const popupTab = tabs.find((tab) => tab.id != null && tab.windowId != null)
  if (popupTab?.id != null && popupTab.windowId != null) {
    await chrome.tabs.update(popupTab.id, { active: true })
    await chrome.windows.update(popupTab.windowId, { focused: true })
    return
  }

  await chrome.windows.create({
    url: targetUrl,
    type: 'popup',
    width: size.width,
    height: size.height,
    focused: true,
  })
}
