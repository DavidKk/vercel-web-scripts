/** Injected by MagickMonkey to hide @page-agent highlight overlays without breaking indexing. */
export const VWS_PAGE_AGENT_HIDE_HIGHLIGHTS_STYLE_ID = 'vws-page-agent-hide-highlights'

const HIGHLIGHT_GUARD_KEY = '__VWS_PAGE_AGENT_HIGHLIGHT_GUARD__'

type DocumentWithHighlightGuard = Document & {
  [HIGHLIGHT_GUARD_KEY]?: MutationObserver
}

function isHighlightRoot(node: Element): boolean {
  return node.id === 'playwright-highlight-container' || node.classList.contains('playwright-highlight-label')
}

function containsHighlightRoot(node: Element): boolean {
  if (isHighlightRoot(node)) {
    return true
  }
  return Boolean(node.querySelector('#playwright-highlight-container, .playwright-highlight-label'))
}

/**
 * Best-effort CSS hide (works when CSP allows inline/extension styles).
 * @param doc Target document
 */
function tryInjectHideStyles(doc: Document): void {
  if (doc.getElementById(VWS_PAGE_AGENT_HIDE_HIGHLIGHTS_STYLE_ID)) {
    return
  }
  try {
    const style = doc.createElement('style')
    style.id = VWS_PAGE_AGENT_HIDE_HIGHLIGHTS_STYLE_ID
    style.textContent = [
      '#playwright-highlight-container,',
      '#playwright-highlight-container *,',
      '.playwright-highlight-label {',
      '  display: none !important;',
      '  visibility: hidden !important;',
      '  opacity: 0 !important;',
      '  pointer-events: none !important;',
      '}',
    ].join('')
    ;(doc.head ?? doc.documentElement).appendChild(style)
  } catch {
    // Strict CSP may block inline <style>; observer + DOM removal still apply.
  }
}

/**
 * Strip highlight nodes as soon as PageController mounts them (CSP-safe).
 * @param doc Target document
 */
function attachPageAgentHighlightObserver(doc: Document): void {
  const guarded = doc as DocumentWithHighlightGuard
  if (guarded[HIGHLIGHT_GUARD_KEY]) {
    return
  }
  if (!doc.documentElement || typeof MutationObserver === 'undefined') {
    return
  }

  const observer = new MutationObserver((mutations) => {
    let needsSweep = false
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue
        }
        if (isHighlightRoot(node)) {
          node.remove()
          continue
        }
        if (containsHighlightRoot(node)) {
          needsSweep = true
        }
      }
    }
    if (needsSweep) {
      removePageAgentHighlightDom(doc)
    }
  })

  observer.observe(doc.documentElement, { childList: true, subtree: true })
  guarded[HIGHLIGHT_GUARD_KEY] = observer
}

/**
 * Keep `updateTree()` indexing, but never show playwright highlight boxes/labels to the user.
 * Uses DOM removal + MutationObserver so strict CSP (no inline styles) still works.
 * @param doc Target document (MAIN world page)
 */
export function ensurePageAgentHighlightsHidden(doc: Document = document): void {
  removePageAgentHighlightDom(doc)
  tryInjectHideStyles(doc)
  attachPageAgentHighlightObserver(doc)
}

/**
 * Remove leftover highlight DOM after a tool finishes (best-effort).
 * @param doc Target document
 */
export function removePageAgentHighlightDom(doc: Document = document): void {
  doc.getElementById('playwright-highlight-container')?.remove()
  for (const label of Array.from(doc.querySelectorAll('.playwright-highlight-label'))) {
    label.remove()
  }
}

/** Disconnect observer between tests. */
export function disconnectPageAgentHighlightGuardForTests(doc: Document = document): void {
  const guarded = doc as DocumentWithHighlightGuard
  guarded[HIGHLIGHT_GUARD_KEY]?.disconnect()
  delete guarded[HIGHLIGHT_GUARD_KEY]
}
