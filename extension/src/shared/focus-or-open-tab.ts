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
 * Focus an existing extension page tab, or open it.
 * @param pagePath - Path under extension root, e.g. `scripts.html`
 */
export async function focusOrOpenExtensionPage(pagePath: string): Promise<void> {
  await focusOrOpenTab(chrome.runtime.getURL(pagePath))
}
