const TRUSTED_HTML_POLICY_NAME = 'vwsTrustedHtml'

/**
 * Whether an error was thrown by Trusted Types blocking HTML assignment.
 * @param error Caught DOM assignment error
 */
export function isTrustedTypesHtmlError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return /TrustedHTML/i.test(error.message)
}

let trustedHtmlPolicy: TrustedTypePolicy | null | undefined

function getTrustedHtmlPolicy(): TrustedTypePolicy | null {
  if (trustedHtmlPolicy !== undefined) {
    return trustedHtmlPolicy
  }

  trustedHtmlPolicy = null
  if (typeof window === 'undefined') {
    return trustedHtmlPolicy
  }

  const factory = (window as Window & { trustedTypes?: TrustedTypePolicyFactory }).trustedTypes
  if (!factory?.createPolicy) {
    return trustedHtmlPolicy
  }

  try {
    trustedHtmlPolicy = factory.createPolicy(TRUSTED_HTML_POLICY_NAME, { createHTML: (input) => input })
  } catch {
    trustedHtmlPolicy = factory.defaultPolicy ?? null
  }

  return trustedHtmlPolicy
}

function moveFragmentChildren(fragment: DocumentFragment, target: Element | ShadowRoot): void {
  while (target.firstChild) {
    target.removeChild(target.firstChild)
  }
  while (fragment.firstChild) {
    target.appendChild(fragment.firstChild)
  }
}

function parseViaDomParser(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const fragment = document.createDocumentFragment()
  for (const node of [...doc.head.childNodes, ...doc.body.childNodes]) {
    fragment.appendChild(document.importNode(node, true))
  }
  return fragment
}

/**
 * Parse HTML via `<template>` when allowed. Avoids DOMParser on normal pages so
 * extension hooks (e.g. React DevTools) are less likely to interfere.
 */
function tryParseViaTemplate(html: string): DocumentFragment | null {
  const template = document.createElement('template')
  const policy = getTrustedHtmlPolicy()
  const trustedHtml = policy ? policy.createHTML(html) : html

  try {
    template.innerHTML = trustedHtml as unknown as string
  } catch (error) {
    if (isTrustedTypesHtmlError(error)) {
      return null
    }
    throw error
  }

  if (html.trim() && template.content.childNodes.length === 0) {
    return null
  }

  const fragment = document.createDocumentFragment()
  while (template.content.firstChild) {
    fragment.appendChild(template.content.firstChild)
  }
  return fragment
}

function parseHtmlFragment(html: string): DocumentFragment {
  const viaTemplate = tryParseViaTemplate(html)
  if (viaTemplate) {
    return viaTemplate
  }
  return parseViaDomParser(html)
}

function appendHtmlToFragment(fragment: DocumentFragment, html: string): void {
  const parsed = parseHtmlFragment(html)
  while (parsed.firstChild) {
    fragment.appendChild(parsed.firstChild)
  }
}

function setInnerHtmlViaFragment(element: Element | ShadowRoot, html: string): void {
  moveFragmentChildren(parseHtmlFragment(html), element)
}

/**
 * Clear element children without using `innerHTML = ''` (Trusted Types safe).
 * @param element Target element or shadow root
 */
export function GME_clearElement(element: Element | ShadowRoot): void {
  element.replaceChildren()
}

/**
 * Assign HTML to an element or shadow root.
 * Uses `<template>` on normal pages; falls back to DOMParser only when Trusted Types blocks template parsing.
 * @param element Target element or shadow root
 * @param html HTML string to assign
 */
export function GME_setInnerHTML(element: Element | ShadowRoot, html: string): void {
  setInnerHtmlViaFragment(element, html)
}

/**
 * Move a `<template>` element's contents into a shadow root or host without `innerHTML`.
 * @param target Shadow root or element to receive template children
 * @param template Template element created by {@link mountUiTemplateShell}
 */
export function adoptTemplateContent(target: Element | ShadowRoot, template: HTMLTemplateElement): void {
  while (target.firstChild) {
    target.removeChild(target.firstChild)
  }
  while (template.content.firstChild) {
    target.appendChild(template.content.firstChild)
  }
}

/**
 * Mount the standard preset UI template shell used by custom elements.
 * @param container Host custom element
 * @param styleContent CSS for the shadow template
 * @param htmlContent Inner HTML for the shadow template
 */
export function mountUiTemplateShell(container: HTMLElement, styleContent: string, htmlContent: string): void {
  const template = document.createElement('template')
  appendHtmlToFragment(template.content, `<style>${styleContent}</style>${htmlContent}`)
  container.appendChild(template)
}
