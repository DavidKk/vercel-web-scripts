type InjectionDocument = Pick<Document, 'contentType' | 'documentElement'>

/**
 * Whether the top-level document is a normal HTML page suitable for preset / launcher injection.
 * Non-HTML documents (JSON, images, raw JS, XML, etc.) are skipped; static asset handling is a separate future module.
 */
export function isHtmlDocumentForInjection(doc: InjectionDocument = document): boolean {
  const contentType = doc.contentType?.trim()
  if (contentType) {
    return /^text\/html\b/i.test(contentType)
  }
  const root = doc.documentElement
  if (!root) {
    return false
  }
  return root.tagName === 'HTML' || root.namespaceURI === 'http://www.w3.org/1999/xhtml'
}
