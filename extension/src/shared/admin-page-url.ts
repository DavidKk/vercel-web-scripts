export const ADMIN_PAGE = 'admin.html'

export const LEGACY_ADMIN_PAGES = new Set(['servers.html', 'scripts.html', 'rules.html'])

/**
 * Normalize extension admin page paths to canonical `admin.html#…` routes.
 * Legacy `servers.html` / `scripts.html` / `rules.html` paths are rewritten in-process.
 */
export function normalizeExtensionPagePath(pagePath: string): string {
  const hashIndex = pagePath.indexOf('#')
  const path = hashIndex >= 0 ? pagePath.slice(0, hashIndex) : pagePath
  const hash = hashIndex >= 0 ? pagePath.slice(hashIndex) : ''

  if (path === ADMIN_PAGE || !LEGACY_ADMIN_PAGES.has(path)) {
    return `${path}${hash}`
  }

  if (path === 'rules.html') {
    const raw = hash.replace(/^#/, '')
    if (raw === 'new' || raw.startsWith('rule/') || raw.startsWith('script/')) {
      return `${ADMIN_PAGE}#rules/${raw}`
    }
    if (raw.startsWith('rules/')) {
      return `${ADMIN_PAGE}#${raw}`
    }
    return `${ADMIN_PAGE}#rules`
  }

  if (path === 'servers.html') {
    return `${ADMIN_PAGE}#servers`
  }

  return `${ADMIN_PAGE}#scripts`
}

/**
 * Derive canonical `admin.html#…` page path from an extension admin tab URL.
 * @param tabUrl Full tab URL from chrome.tabs
 */
export function adminPagePathFromTabUrl(tabUrl: string | undefined): string {
  if (!tabUrl) {
    return `${ADMIN_PAGE}#servers`
  }
  try {
    const url = new URL(tabUrl)
    const path = url.pathname.split('/').pop() ?? ADMIN_PAGE
    return normalizeExtensionPagePath(`${path}${url.hash}`)
  } catch {
    return `${ADMIN_PAGE}#servers`
  }
}
