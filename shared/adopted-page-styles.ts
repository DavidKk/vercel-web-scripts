/**
 * Apply author CSS via constructable stylesheets (CSP-safe on strict pages).
 * Falls back to `<style>` only when the API is unavailable.
 */

function supportsConstructableStyleSheets(target: Document | ShadowRoot): boolean {
  try {
    return typeof CSSStyleSheet !== 'undefined' && typeof CSSStyleSheet.prototype.replaceSync === 'function' && 'adoptedStyleSheets' in target
  } catch {
    return false
  }
}

/**
 * Append bundled CSS to a document or shadow root.
 * @param target Document or open shadow root
 * @param cssText Stylesheet text
 * @returns True when constructable stylesheets were used
 */
export function appendAdoptedStyles(target: Document | ShadowRoot, cssText: string): boolean {
  if (supportsConstructableStyleSheets(target)) {
    try {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(cssText)
      target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet]
      return true
    } catch {
      // Fall through when replaceSync fails on invalid CSS.
    }
  }

  const ownerDocument = target instanceof Document ? target : target.ownerDocument
  const style = (ownerDocument ?? document).createElement('style')
  style.textContent = cssText
  if (target instanceof Document) {
    target.head.appendChild(style)
  } else {
    target.prepend(style)
  }
  return false
}
