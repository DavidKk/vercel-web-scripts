const CSP_META_SELECTORS = 'meta[http-equiv="Content-Security-Policy" i], meta[http-equiv="Content-Security-Policy-Report-Only" i]'

type InjectionDocument = Pick<Document, 'querySelectorAll' | 'title' | 'body'>

/**
 * Whether a CSP meta directive blocks inline / author styles on the page.
 * @param directive Single CSP directive value (e.g. `default-src 'none'`)
 */
export function isRestrictiveCspDirective(directive: string): boolean {
  const normalized = directive.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (/default-src\s+'none'/.test(normalized)) {
    return true
  }
  if (/style-src[^;]*'none'/.test(normalized)) {
    return true
  }
  if (/style-src(?:-elem|-attr)?\s+'none'/.test(normalized)) {
    return true
  }
  if (/style-src(?:-elem|-attr)?\b/.test(normalized) && !/'unsafe-inline'/.test(normalized) && !/nonce-/.test(normalized) && !/sha\d{3}-/.test(normalized)) {
    return true
  }
  return false
}

/**
 * Read CSP directive strings from document meta tags.
 * @param doc Document to inspect
 */
export function readDocumentCspMetaDirectives(doc: InjectionDocument = document): string[] {
  const directives: string[] = []
  doc.querySelectorAll(CSP_META_SELECTORS).forEach((node) => {
    const content = node.getAttribute('content')?.trim()
    if (content) {
      directives.push(content)
    }
  })
  return directives
}

/**
 * Whether the document exposes a restrictive CSP via meta tags.
 * @param doc Document to inspect
 */
export function hasRestrictivePageCspMeta(doc: InjectionDocument = document): boolean {
  return readDocumentCspMetaDirectives(doc).some(isRestrictiveCspDirective)
}

/**
 * Remove CSP meta tags from the live document so page-world preset UI can style Shadow DOM.
 * HTTP response CSP must be stripped separately (extension DNR + one-shot reload).
 * @param doc Document to mutate
 * @returns Number of removed meta elements
 */
export function stripDocumentCspMetaTags(doc: Document = document): number {
  const nodes = [...doc.querySelectorAll(CSP_META_SELECTORS)]
  nodes.forEach((node) => node.remove())
  return nodes.length
}

/**
 * Heuristic for bare server error pages (Express/nginx 404/500 text responses).
 * @param doc Document to inspect
 */
export function looksLikeServerErrorPage(doc: InjectionDocument = document): boolean {
  const title = doc.title?.trim().toLowerCase() ?? ''
  if (/\b(404|500|502|503)\b/.test(title) || title.includes('not found') || title === 'error') {
    return true
  }
  const bodyText = doc.body?.textContent?.trim().slice(0, 240).toLowerCase() ?? ''
  return /cannot get|not found|internal server error|bad gateway|service unavailable/.test(bodyText)
}

/**
 * Whether bootstrap should strip/reload CSP before injecting preset UI.
 * @param doc Document to inspect
 */
export function pageNeedsCspReliefForInjection(doc: InjectionDocument = document): boolean {
  return hasRestrictivePageCspMeta(doc) || looksLikeServerErrorPage(doc)
}
