import { isHtmlDocumentForInjection } from '@ext/bridge/injection-gate'

function mockDoc(contentType: string, root?: { tagName: string; namespaceURI: string | null }): Pick<Document, 'contentType' | 'documentElement'> {
  return {
    contentType,
    documentElement: (root ?? null) as Document['documentElement'],
  }
}

describe('injection-gate', () => {
  it('should allow text/html documents', () => {
    expect(isHtmlDocumentForInjection(mockDoc('text/html'))).toBe(true)
    expect(isHtmlDocumentForInjection(mockDoc('text/html; charset=utf-8'))).toBe(true)
  })

  it('should reject non-html content types', () => {
    expect(isHtmlDocumentForInjection(mockDoc('application/json'))).toBe(false)
    expect(isHtmlDocumentForInjection(mockDoc('image/png'))).toBe(false)
    expect(isHtmlDocumentForInjection(mockDoc('application/javascript'))).toBe(false)
    expect(isHtmlDocumentForInjection(mockDoc('text/plain'))).toBe(false)
    expect(isHtmlDocumentForInjection(mockDoc('application/xml'))).toBe(false)
  })

  it('should fall back to html root when content type is missing', () => {
    expect(
      isHtmlDocumentForInjection(
        mockDoc('', {
          tagName: 'HTML',
          namespaceURI: 'http://www.w3.org/1999/xhtml',
        })
      )
    ).toBe(true)
    expect(isHtmlDocumentForInjection(mockDoc(''))).toBe(false)
  })
})
