/**
 * @jest-environment jsdom
 */

import { appendAdoptedStyles } from '../../shared/adopted-page-styles'

describe('appendAdoptedStyles', () => {
  it('applies CSS via adoptedStyleSheets when supported', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    const adopted = appendAdoptedStyles(shadow, '.panel { color: red; }')

    if (adopted) {
      expect(shadow.adoptedStyleSheets.length).toBeGreaterThan(0)
      expect(shadow.querySelector('style')).toBeNull()
    } else {
      expect(shadow.querySelector('style')?.textContent).toContain('.panel { color: red; }')
    }
  })
})
