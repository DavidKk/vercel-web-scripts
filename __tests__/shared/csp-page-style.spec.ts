/**
 * @jest-environment jsdom
 */

import {
  hasRestrictivePageCspMeta,
  isRestrictiveCspDirective,
  looksLikeServerErrorPage,
  pageNeedsCspReliefForInjection,
  stripDocumentCspMetaTags,
} from '../../shared/csp-page-style'

describe('csp-page-style', () => {
  it('isRestrictiveCspDirective flags default-src none', () => {
    expect(isRestrictiveCspDirective("default-src 'none'")).toBe(true)
    expect(isRestrictiveCspDirective("default-src 'self'")).toBe(false)
  })

  it('hasRestrictivePageCspMeta reads meta tags', () => {
    document.head.innerHTML = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'
    expect(hasRestrictivePageCspMeta()).toBe(true)
  })

  it('stripDocumentCspMetaTags removes CSP meta tags', () => {
    document.head.innerHTML = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'
    expect(stripDocumentCspMetaTags()).toBe(1)
    expect(hasRestrictivePageCspMeta()).toBe(false)
  })

  it('looksLikeServerErrorPage matches bare Express 404 text', () => {
    document.body.innerHTML = '<pre>Cannot GET /admin</pre>'
    expect(looksLikeServerErrorPage()).toBe(true)
  })

  it('pageNeedsCspReliefForInjection is true for error pages or restrictive meta', () => {
    document.head.innerHTML = ''
    document.body.innerHTML = '<pre>Cannot GET /admin</pre>'
    expect(pageNeedsCspReliefForInjection()).toBe(true)

    document.body.innerHTML = '<p>Hello</p>'
    document.head.innerHTML = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'
    expect(pageNeedsCspReliefForInjection()).toBe(true)
  })
})
