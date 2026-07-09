/**
 * @jest-environment jsdom
 */

import { adoptTemplateContent, isTrustedTypesHtmlError, mountUiTemplateShell } from '../../preset/src/helpers/safe-inner-html'
import { appendAdoptedStyles } from '../../shared/adopted-page-styles'

describe('safe-inner-html', () => {
  it('isTrustedTypesHtmlError detects TrustedHTML assignment errors', () => {
    expect(isTrustedTypesHtmlError(new Error("Failed to set the 'innerHTML' property: TrustedHTML"))).toBe(true)
    expect(isTrustedTypesHtmlError(new Error('other'))).toBe(false)
  })

  it('mountUiTemplateShell stores CSS separately from template markup', () => {
    const host = document.createElement('div')
    mountUiTemplateShell(host, '.panel { color: red; }', '<div class="panel">Hi</div>')

    const template = host.querySelector('template')
    expect(template).not.toBeNull()
    expect(template?.content.querySelector('style')).toBeNull()
    expect(template?.content.querySelector('.panel')).not.toBeNull()
  })

  it('adoptTemplateContent applies bundled CSS to the shadow root', () => {
    const host = document.createElement('div')
    mountUiTemplateShell(host, '.panel { color: red; }', '<div class="panel">Hi</div>')

    const template = host.querySelector('template')
    expect(template).toBeInstanceOf(HTMLTemplateElement)

    const shadow = host.attachShadow({ mode: 'open' })
    adoptTemplateContent(shadow, template as HTMLTemplateElement)

    expect(shadow.querySelector('.panel')).not.toBeNull()

    const usesAdoptedSheets = 'adoptedStyleSheets' in shadow && shadow.adoptedStyleSheets.length > 0
    if (usesAdoptedSheets) {
      expect(shadow.querySelector('style')).toBeNull()
      expect(getComputedStyle(shadow.querySelector('.panel') as HTMLElement).color).toBe('rgb(255, 0, 0)')
    } else {
      expect(shadow.querySelector('style')?.textContent).toContain('.panel { color: red; }')
    }
  })

  it('applyShadowStyles uses a style element when constructable stylesheets are unavailable', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const original = CSSStyleSheet.prototype.replaceSync

    Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
      configurable: true,
      value() {
        throw new Error('replaceSync blocked')
      },
    })

    try {
      const adopted = appendAdoptedStyles(shadow, '.fallback { color: blue; }')
      expect(adopted).toBe(false)
      expect(shadow.querySelector('style')?.textContent).toContain('.fallback { color: blue; }')
    } finally {
      Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
        configurable: true,
        value: original,
      })
    }
  })
})
