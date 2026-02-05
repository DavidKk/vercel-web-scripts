/**
 * XPath generation helper functions
 * Provides utilities for generating and validating XPath expressions from DOM elements
 */

import { GME_warn } from './logger'

/**
 * Check if a string looks like a hash (dynamic generated content)
 * This function is used to filter out hash-like values from all attributes
 * (class, id, data-*, name, role, etc.) to ensure XPath stability.
 *
 * Note: This can be optimized later to improve hash detection accuracy.
 *
 * @param value String to check (can be any attribute value)
 * @returns Whether it looks like a hash
 */
export function isHashLike(value: string): boolean {
  if (!value || typeof value !== 'string') return false

  const trimmed = value.trim()
  if (!trimmed) return false

  // Pure hash pattern: 8+ hex characters
  const pureHashPattern = /^[a-f0-9]{8,}$/i
  if (pureHashPattern.test(trimmed)) return true

  // Hash-like patterns: contains long hex sequences
  // e.g., "component-abc123def456", "abc123def456-xyz"
  const hashLikePattern = /[a-f0-9]{12,}/i
  if (hashLikePattern.test(trimmed)) return true

  // UUID-like patterns
  const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
  if (uuidPattern.test(trimmed)) return true

  return false
}

/**
 * Get class attribute value (filtered for non-hash classes, simplified)
 * Uses isHashLike() to filter out hash-like class values
 * For long class lists, only returns the first few meaningful classes to keep XPath simple
 * @param node Node to get class from
 * @param simplify Whether to simplify (only use first few classes) for long lists
 * @returns Class string (non-hash classes only, simplified) or null
 */
export function getClassAttribute(node: HTMLElement, simplify = true): string | null {
  const className = node.className
  if (!className || typeof className !== 'string') return null

  const classStr = className.trim()
  if (!classStr) return null

  // Split by spaces and filter out hash-like classes using unified function
  const classes = classStr.split(/\s+/).filter((c) => c.length > 0 && !isHashLike(c))

  if (classes.length === 0) return null

  // If simplifying and class list is long, only use first 2-3 classes
  // This keeps XPath simpler and more maintainable
  if (simplify && classes.length > 3) {
    // Use first 2 classes (or first 3 if they're short)
    const simplified = classes.slice(0, 2)
    const totalLength = simplified.join(' ').length

    // If first 2 classes are short, add one more
    if (totalLength < 30 && classes.length > 2) {
      simplified.push(classes[2])
    }

    return simplified.join(' ')
  }

  // Return filtered classes joined
  return classes.join(' ')
}

/**
 * Get stable attributes for XPath generation (excluding hash-like values)
 * Uses isHashLike() to filter out hash-like values from all attributes
 * @param node Node to get attributes from
 * @returns Array of [attributeName, attributeValue] pairs
 */
export function getStableAttributes(node: HTMLElement): Array<[string, string]> {
  const attrs: Array<[string, string]> = []
  if (!node.attributes) return attrs

  // Attributes to check (in priority order)
  const attrNames = ['data-testid', 'data-id', 'data-component-id', 'name', 'role', 'type', 'href', 'src', 'alt', 'title', 'value', 'placeholder']

  // Check priority attributes using unified hash detection
  for (const attrName of attrNames) {
    const value = node.getAttribute(attrName)
    if (value && typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed && !isHashLike(trimmed)) {
        attrs.push([attrName, trimmed])
      }
    }
  }

  // Also check other data-* attributes using unified hash detection
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i]
    const name = attr.name.toLowerCase()
    const value = attr.value.trim()

    if (name.startsWith('data-') && value && !isHashLike(value)) {
      // Skip if already added
      if (!attrs.some(([n]) => n === name)) {
        attrs.push([name, value])
      }
    }
  }

  return attrs
}

/**
 * Generate XPath with specific strategy
 * @param node Node to generate XPath for
 * @param useFullClass Whether to use full class list (false = simplified)
 * @param useAllAttributes Whether to use all stable attributes (false = priority only)
 * @returns XPath string
 */
export function generateXPathWithStrategy(node: HTMLElement, useFullClass: boolean, useAllAttributes: boolean): string {
  const segments: string[] = []
  let current: HTMLElement | null = node

  // Build path from node to document root, but skip HTML and BODY
  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase()

    // Skip HTML and BODY nodes - don't include them in the path
    if (tag === 'html' || tag === 'body') {
      current = current.parentElement
      continue
    }

    let segment: string | null = null

    // Priority 1: Use class if available
    const className = getClassAttribute(current, !useFullClass)
    if (className) {
      // For class attributes, use contains() function instead of exact match
      // because class is a space-separated list and order may vary
      // Split by space and use contains for the first class (most stable)
      const classes = className.split(/\s+/).filter((c) => c.length > 0)
      if (classes.length > 0) {
        // Use the first class with contains() for better matching
        // Escape single quotes in class value
        const firstClass = classes[0].replace(/'/g, "\\'")
        segment = `${tag}[contains(@class, '${firstClass}')]`
      }
    }
    // Priority 2: Use ID if available (very stable, exclude hash-like)
    else if (current.id && current.id.trim() && !isHashLike(current.id.trim())) {
      segment = `${tag}[@id='${current.id.replace(/'/g, "\\'")}']`
    }
    // Priority 3: Use data-* attributes or other stable attributes
    else {
      const stableAttrs = useAllAttributes ? getStableAttributes(current) : getStableAttributes(current).slice(0, 1) // Only first priority attribute
      if (stableAttrs.length > 0) {
        // Use the first stable attribute (already in priority order)
        const [attrName, attrValue] = stableAttrs[0]
        const escapedValue = attrValue.replace(/'/g, "\\'")
        segment = `${tag}[@${attrName}='${escapedValue}']`
      }
    }

    // If no stable attribute found, use tag only (no position index)
    // This is less specific but avoids position-based fragility
    if (!segment) {
      segment = tag
    }

    segments.unshift(segment)
    current = current.parentElement
  }

  // Use // so path is valid when html/body are skipped (document root's child is html, not the first segment)
  return '//' + segments.join('/')
}

/**
 * Format node information as readable string
 * @param node Node to format
 * @param prefix Prefix for the info (e.g., "Expected" or "Found")
 * @returns Formatted string
 */
export function formatNodeInfo(node: HTMLElement, prefix: string): string {
  const parts: string[] = [`${prefix}:`]
  parts.push(`tag=${node.tagName.toLowerCase()}`)

  if (node.id) {
    parts.push(`id="${node.id}"`)
  }

  if (node.className && typeof node.className === 'string') {
    const classes = node.className
      .trim()
      .split(/\s+/)
      .filter((c) => c.length > 0)
    if (classes.length > 0) {
      // Show first 3 classes if many
      const displayClasses = classes.length > 3 ? classes.slice(0, 3).join(' ') + ` (+${classes.length - 3} more)` : classes.join(' ')
      parts.push(`class="${displayClasses}"`)
    }
  }

  // Add data attributes if available
  const dataAttrs: string[] = []
  if (node.hasAttribute('data-testid')) {
    dataAttrs.push(`data-testid="${node.getAttribute('data-testid')}"`)
  }
  if (node.hasAttribute('data-id')) {
    dataAttrs.push(`data-id="${node.getAttribute('data-id')}"`)
  }
  if (dataAttrs.length > 0) {
    parts.push(dataAttrs.join(', '))
  }

  return parts.join(' ')
}

/**
 * Validate XPath by checking if it correctly finds the original node
 * @param xpath XPath string to validate
 * @param originalNode Original node that the XPath should find
 * @returns Whether the XPath correctly finds the original node
 */
export function validateXPath(xpath: string, originalNode: HTMLElement): boolean {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
    const foundNode = result.singleNodeValue as HTMLElement | null

    // Check if found node is exactly the original node
    if (foundNode === originalNode) {
      return true
    }

    // If not found or found different node, XPath is invalid
    if (foundNode !== originalNode) {
      // Format validation failure message as readable string
      const originalInfo = formatNodeInfo(originalNode, 'Expected')
      const foundInfo = foundNode ? formatNodeInfo(foundNode, 'Found') : 'Found: null (node not found)'

      GME_warn(
        '[node-selector] XPath validation failed',
        `\nXPath: ${xpath}`,
        `\n${originalInfo}`,
        `\n${foundInfo}`,
        foundNode ? '\n⚠ XPath found a different node!' : '\n⚠ XPath did not find the node!'
      )
    }

    return false
  } catch (e) {
    GME_warn('[node-selector] XPath validation error:', `XPath: ${xpath}`, `Error: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

/**
 * Generate XPath for a node (attribute-based, no position index)
 * Prioritizes: class > id > data-* attributes > name/role/type
 * Filters out hash-like values
 * Skips HTML and BODY nodes - starts from body's first child element
 * Never uses position index - only uses attributes + tag name
 * Validates the generated XPath to ensure it correctly finds the original node
 * @param node Node to generate XPath for
 * @returns XPath string (attribute-based only, starts from body's child, validated) or null if validation fails
 */
export function generateXPath(node: HTMLElement): string | null {
  // Try generating XPath with different strategies until we find one that works
  const strategies = [
    () => generateXPathWithStrategy(node, true, true), // Full class, all attributes
    () => generateXPathWithStrategy(node, false, true), // Simplified class, all attributes
    () => generateXPathWithStrategy(node, true, false), // Full class, priority attributes only
    () => generateXPathWithStrategy(node, false, false), // Simplified class, priority attributes only
  ]

  for (const strategy of strategies) {
    const xpath = strategy()
    if (xpath && validateXPath(xpath, node)) {
      return xpath
    }
  }

  // If all strategies fail, return null (don't record invalid XPath)
  return null
}

/**
 * Find element by XPath
 * @param xpath XPath expression
 * @returns Found HTMLElement or null
 */
export function findElementByXPath(xpath: string): HTMLElement | null {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
    return result.singleNodeValue as HTMLElement | null
  } catch (e) {
    GME_warn('[node-selector] XPath evaluation failed:', xpath, e)
    return null
  }
}
