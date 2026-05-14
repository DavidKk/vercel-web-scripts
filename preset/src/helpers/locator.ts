/**
 * Locator JSON generation and replay helpers.
 * Multi-strategy DOM targeting from semantic fingerprints; suited to dynamic DOM / SPAs.
 */

import { generateXPath, isHashLike } from './xpath'

/**
 * Locator JSON payload shape.
 */
export interface LocatorJSON {
  /** Tag name; narrows candidate set */
  tag?: string
  /** ARIA role for stable semantic targeting */
  role?: string
  /** Node text (innerText, truncated to ≤120 chars) */
  text?: string
  /** Stable attribute bag */
  attributes?: Record<string, string>
  /** Stable class list (dynamic hashes filtered out) */
  stableClasses?: string[]
  /** Neighbor semantic text (context matching) */
  nearText?: string[]
  /** DOM depth */
  domDepth?: number
  /** Positional hints */
  positionHint?: {
    /** Index among same tag name siblings */
    indexAmongSameTag?: number
  }
  /** XPath fallback */
  xpathFallback?: string
  /** Creation timestamp */
  createdAt?: number
  /** Schema version */
  version?: number
  /** Stability tier (A–E) */
  stabilityLevel?: 'A' | 'B' | 'C' | 'D' | 'E'
}

/**
 * Match scoring result.
 */
interface MatchScore {
  /** Matched element */
  node: HTMLElement
  /** Total score */
  score: number
  /** Per-signal breakdown */
  details: {
    testIdMatch?: number
    roleMatch?: number
    textExactMatch?: number
    textFuzzyMatch?: number
    stableClassMatch?: number
    nearTextMatch?: number
    depthMatch?: number
  }
}

/**
 * Score weights.
 */
const SCORE_WEIGHTS = {
  testIdMatch: 100,
  roleMatch: 60,
  textExactMatch: 50,
  textFuzzyMatch: 30,
  stableClassMatch: 20,
  nearTextMatch: 15,
  depthMatch: 10,
}

/**
 * Whether a class token looks like a build-time hash.
 * @param className Class token
 */
function isHashClass(className: string): boolean {
  if (!className || className.length >= 20) {
    return false
  }
  // Typical hashed tokens: css-*, sc-*, jsx-*, or short opaque hashes
  const hashPattern = /^css-|^sc-|^jsx-|^[a-z0-9]{6,}$/i
  return hashPattern.test(className)
}

/**
 * Stable classes only (strip dynamic-looking tokens).
 * @param node DOM node
 */
function extractStableClasses(node: HTMLElement): string[] {
  const className = node.className
  if (!className || typeof className !== 'string') {
    return []
  }

  const classes = className.split(/\s+/).filter((c) => c.trim().length > 0 && !isHashClass(c.trim()) && !isHashLike(c.trim()))

  return classes
}

/**
 * Stable attributes (priority attrs + other data-*).
 * @param node DOM node
 */
function extractStableAttributes(node: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {}

  // High-signal attributes first
  const priorityAttrs = ['data-testid', 'data-id', 'data-component-id', 'name', 'role', 'type', 'placeholder', 'title', 'href', 'src', 'alt', 'aria-label', 'aria-labelledby']

  for (const attrName of priorityAttrs) {
    const value = node.getAttribute(attrName)
    if (value && typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed && !isHashLike(trimmed)) {
        attrs[attrName] = trimmed
      }
    }
  }

  // Other data-* attributes
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i]
    const name = attr.name.toLowerCase()
    const value = attr.value.trim()

    if (name.startsWith('data-') && value && !isHashLike(value)) {
      if (!attrs[name]) {
        attrs[name] = value
      }
    }
  }

  return attrs
}

/**
 * Visible text for the node (truncated).
 * @param node DOM node
 */
function extractText(node: HTMLElement): string | undefined {
  const text = node.innerText || node.textContent || ''
  const trimmed = text.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.length > 120 ? trimmed.substring(0, 120) : trimmed
}

/**
 * Neighbor semantic snippets from parent / siblings.
 * @param node DOM node
 */
function extractNearText(node: HTMLElement): string[] {
  const nearText: string[] = []
  const maxLength = 50
  const maxCount = 5

  let parent = node.parentElement
  let parentCount = 0
  while (parent && parentCount < 2 && nearText.length < maxCount) {
    const text = (parent.innerText || parent.textContent || '').trim()
    if (text && text.length <= maxLength && text !== (node.innerText || node.textContent || '').trim()) {
      nearText.push(text.substring(0, maxLength))
    }
    parent = parent.parentElement
    parentCount++
  }

  const siblings = Array.from(node.parentElement?.children || [])
  for (const sibling of siblings) {
    if (sibling === node || nearText.length >= maxCount) {
      continue
    }
    const text = ((sibling as HTMLElement).innerText || sibling.textContent || '').trim()
    if (text && text.length <= maxLength) {
      nearText.push(text.substring(0, maxLength))
    }
  }

  return nearText.slice(0, maxCount)
}

/**
 * DOM depth from documentElement.
 * @param node DOM node
 */
function calculateDomDepth(node: HTMLElement): number {
  let depth = 0
  let current: HTMLElement | null = node
  while (current && current !== document.documentElement) {
    depth++
    current = current.parentElement
  }
  return depth
}

/**
 * Index among siblings with the same tag name.
 * @param node DOM node
 */
function calculateIndexAmongSameTag(node: HTMLElement): number {
  const tag = node.tagName.toLowerCase()
  const siblings = Array.from(node.parentElement?.children || [])
  const sameTagSiblings = siblings.filter((s) => s.tagName.toLowerCase() === tag)
  return sameTagSiblings.indexOf(node)
}

/**
 * Assign stability tier from captured fields.
 * @param locator Locator JSON
 */
function evaluateStabilityLevel(locator: LocatorJSON): 'A' | 'B' | 'C' | 'D' | 'E' {
  // A: test id / aria present
  if (locator.attributes?.['data-testid'] || locator.attributes?.['aria-label'] || locator.attributes?.['aria-labelledby']) {
    return 'A'
  }
  // B: role + text
  if (locator.role && locator.text) {
    return 'B'
  }
  // C: text only
  if (locator.text) {
    return 'C'
  }
  // D: structural hints
  if (locator.stableClasses || locator.nearText || locator.domDepth !== undefined) {
    return 'D'
  }
  // E: XPath only
  return 'E'
}

/**
 * Build Locator JSON from a live DOM node.
 * @param node DOM node
 */
export function generateLocatorJSON(node: HTMLElement): LocatorJSON {
  const tag = node.tagName.toLowerCase()
  const role = node.getAttribute('role') || undefined
  const text = extractText(node)
  const attributes = extractStableAttributes(node)
  const stableClasses = extractStableClasses(node)
  const nearText = extractNearText(node)
  const domDepth = calculateDomDepth(node)
  const indexAmongSameTag = calculateIndexAmongSameTag(node)
  const xpathFallback = generateXPath(node) || undefined

  const locator: LocatorJSON = {
    tag,
    role,
    text,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
    stableClasses: stableClasses.length > 0 ? stableClasses : undefined,
    nearText: nearText.length > 0 ? nearText : undefined,
    domDepth,
    positionHint:
      indexAmongSameTag >= 0
        ? {
            indexAmongSameTag,
          }
        : undefined,
    xpathFallback,
    createdAt: Date.now(),
    version: 1,
  }

  locator.stabilityLevel = evaluateStabilityLevel(locator)

  return locator
}

/**
 * Score how well a candidate matches the locator.
 * @param node Candidate element
 * @param locator Locator JSON
 */
function calculateMatchScore(node: HTMLElement, locator: LocatorJSON): MatchScore {
  const details: MatchScore['details'] = {}
  let score = 0

  // 1. data-testid (+100)
  if (locator.attributes?.['data-testid']) {
    const nodeTestId = node.getAttribute('data-testid')
    if (nodeTestId === locator.attributes['data-testid']) {
      details.testIdMatch = SCORE_WEIGHTS.testIdMatch
      score += SCORE_WEIGHTS.testIdMatch
    }
  }

  // 2. role (+60)
  if (locator.role) {
    const nodeRole = node.getAttribute('role')
    if (nodeRole === locator.role) {
      details.roleMatch = SCORE_WEIGHTS.roleMatch
      score += SCORE_WEIGHTS.roleMatch
    }
  }

  // 3. exact text (+50)
  if (locator.text) {
    const nodeText = (node.innerText || node.textContent || '').trim()
    if (nodeText === locator.text) {
      details.textExactMatch = SCORE_WEIGHTS.textExactMatch
      score += SCORE_WEIGHTS.textExactMatch
    } else if (nodeText.includes(locator.text) || locator.text.includes(nodeText)) {
      // 4. fuzzy text (+30)
      details.textFuzzyMatch = SCORE_WEIGHTS.textFuzzyMatch
      score += SCORE_WEIGHTS.textFuzzyMatch
    }
  }

  // 5. stable classes (+20)
  if (locator.stableClasses && locator.stableClasses.length > 0) {
    const nodeClasses = extractStableClasses(node)
    const matchedClasses = locator.stableClasses.filter((c) => nodeClasses.includes(c))
    if (matchedClasses.length > 0) {
      details.stableClassMatch = SCORE_WEIGHTS.stableClassMatch
      score += SCORE_WEIGHTS.stableClassMatch
    }
  }

  // 6. nearText (+15)
  if (locator.nearText && locator.nearText.length > 0) {
    const parentText = (node.parentElement?.innerText || node.parentElement?.textContent || '').trim()
    const hasNearText = locator.nearText.some((nt) => parentText.includes(nt))
    if (hasNearText) {
      details.nearTextMatch = SCORE_WEIGHTS.nearTextMatch
      score += SCORE_WEIGHTS.nearTextMatch
    }
  }

  // 7. depth proximity (+10, decay with distance)
  if (locator.domDepth !== undefined) {
    const nodeDepth = calculateDomDepth(node)
    const depthDiff = Math.abs(nodeDepth - locator.domDepth)
    if (depthDiff <= 2) {
      details.depthMatch = SCORE_WEIGHTS.depthMatch - depthDiff * 2
      score += Math.max(0, SCORE_WEIGHTS.depthMatch - depthDiff * 2)
    }
  }

  return {
    node,
    score,
    details,
  }
}

/**
 * Resolve the best-matching element for a locator.
 * @param locator Locator JSON
 */
export function locateNodeByJSON(locator: LocatorJSON): HTMLElement | null {
  // 1. Exact attribute hit (highest priority)
  if (locator.attributes?.['data-testid']) {
    const node = document.querySelector(`[data-testid="${locator.attributes['data-testid']}"]`) as HTMLElement | null
    if (node) {
      return node
    }
  }

  // 2. role + aria-label
  if (locator.role && locator.attributes?.['aria-label']) {
    const node = document.querySelector(`[role="${locator.role}"][aria-label="${locator.attributes['aria-label']}"]`) as HTMLElement | null
    if (node) {
      return node
    }
  }

  // 3. role + text
  if (locator.role && locator.text) {
    const candidates = Array.from(document.querySelectorAll(`[role="${locator.role}"]`)) as HTMLElement[]
    for (const candidate of candidates) {
      const text = (candidate.innerText || candidate.textContent || '').trim()
      if (text === locator.text || text.includes(locator.text)) {
        return candidate
      }
    }
  }

  // 4. fuzzy text scan
  if (locator.text) {
    const tag = locator.tag || '*'
    const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
    for (const candidate of candidates) {
      const text = (candidate.innerText || candidate.textContent || '').trim()
      if (text.includes(locator.text) || locator.text.includes(text)) {
        return candidate
      }
    }
  }

  // 5. scored multi-strategy pass
  const tag = locator.tag || '*'
  const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
  const scores: MatchScore[] = []

  for (const candidate of candidates) {
    const matchScore = calculateMatchScore(candidate, locator)
    if (matchScore.score > 0) {
      scores.push(matchScore)
    }
  }

  if (scores.length > 0) {
    scores.sort((a, b) => b.score - a.score)
    return scores[0].node
  }

  // 6. XPath fallback
  if (locator.xpathFallback) {
    try {
      const result = document.evaluate(locator.xpathFallback, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      return (result.singleNodeValue as HTMLElement) || null
    } catch (e) {
      // Invalid XPath → null
    }
  }

  return null
}

/**
 * Return top matches sorted by score.
 * @param locator Locator JSON
 * @param maxResults Max number of hits
 */
export function locateAllNodesByJSON(locator: LocatorJSON, maxResults = 10): Array<{ node: HTMLElement; score: number; details: MatchScore['details'] }> {
  const tag = locator.tag || '*'
  const candidates = Array.from(document.querySelectorAll(tag)) as HTMLElement[]
  const scores: MatchScore[] = []

  for (const candidate of candidates) {
    const matchScore = calculateMatchScore(candidate, locator)
    if (matchScore.score > 0) {
      scores.push(matchScore)
    }
  }

  scores.sort((a, b) => b.score - a.score)

  return scores.slice(0, maxResults).map((s) => ({
    node: s.node,
    score: s.score,
    details: s.details,
  }))
}
