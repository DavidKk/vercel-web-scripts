// ============================================================================
// Logging Functions
// ============================================================================

/**
 * Convert HTML-like tags to %c styling format
 * Supports common tags: <b>, <i>, <u>, <s>, and color tags like <red>, <green>, etc.
 * @param text Text containing HTML-like tags
 * @returns Object with converted text and styles array
 */
function convertTagsToStyles(text: string): { text: string; styles: string[] } {
  // Color tag mappings (common color names)
  const colorMap: Record<string, string> = {
    red: '#dc3545',
    green: '#28a745',
    blue: '#007bff',
    yellow: '#ffc107',
    orange: '#fd7e14',
    purple: '#6f42c1',
    pink: '#e83e8c',
    cyan: '#17a2b8',
    gray: '#6c757d',
    grey: '#6c757d',
    black: '#000000',
    white: '#ffffff',
  }

  // Tag style mappings
  const tagStyleMap: Record<string, string> = {
    b: 'font-weight:bold',
    i: 'font-style:italic',
    u: 'text-decoration:underline',
    s: 'text-decoration:line-through',
  }

  // Combine all tag patterns (color tags + style tags)
  const allTags = [...Object.keys(colorMap), ...Object.keys(tagStyleMap)]
  const tagPattern = allTags.join('|')

  // Process tags from innermost to outermost
  let result = text
  const styleStack: string[] = []

  // Keep processing until no more tags
  let changed = true
  while (changed) {
    changed = false
    // Match innermost tags (tags that don't contain other tags)
    const regex = new RegExp(`<(${tagPattern})>([^<]*)</\\1>`, 'gi')
    result = result.replace(regex, (match, tagName, content) => {
      changed = true
      const tag = tagName.toLowerCase()
      const style = colorMap[tag] ? `color:${colorMap[tag]}` : tagStyleMap[tag] || ''

      // If content already has %c, preserve it and wrap with our style
      if (content.includes('%c')) {
        // Content has nested styles, wrap with our style
        styleStack.push(style, '')
        return `%c${content}%c`
      } else {
        // Simple case: wrap content with %c...%c
        styleStack.push(style, '')
        return `%c${content}%c`
      }
    })
  }

  return { text: result, styles: styleStack }
}

/**
 * Process log contents to support %c styling like console.log and HTML-like tags
 * Merges prefix style with user-provided styles in contents
 * Supports both %c syntax and HTML-like tags (<b>, <i>, <u>, <s>, <red>, etc.)
 * Can be used together: HTML tags are converted first, then %c syntax is processed
 * Note: For best results when mixing, place HTML tags before user %c in the string
 * @param prefixText Text prefix with %c placeholder (e.g., '%c✔ [OK]')
 * @param prefixStyle Style for the prefix
 * @param contents User-provided contents (may contain %c, styles, or HTML-like tags)
 * @returns Array of processed arguments for console.log
 */
function processLogContents(prefixText: string, prefixStyle: string, ...contents: any[]): any[] {
  if (contents.length === 0) {
    return [prefixText, prefixStyle]
  }

  // Check if first content is a string
  const firstContent = contents[0]
  if (typeof firstContent !== 'string') {
    // No %c in contents, just append contents after prefix
    return [prefixText, prefixStyle, ...contents]
  }

  // Step 1: Convert HTML-like tags to %c syntax first (if any)
  const tagRegex = /<(b|i|u|s|red|green|blue|yellow|orange|purple|pink|cyan|gray|grey|black|white)>(.*?)<\/\1>/gi
  let processedText = firstContent
  let tagStyles: string[] = []

  if (tagRegex.test(firstContent)) {
    // Convert tags to %c syntax
    const converted = convertTagsToStyles(firstContent)
    processedText = converted.text
    tagStyles = converted.styles
  }

  // Step 2: Process %c syntax (either from user or from converted tags)
  if (processedText.includes('%c')) {
    // Count how many %c were in the original text (user-provided, before tag conversion)
    const originalPercentCCount = (firstContent.match(/%c/g) || []).length
    const userProvidedStyleCount = originalPercentCCount

    // Extract user-provided styles from contents
    const userStyles: string[] = []
    const otherContents: any[] = []

    // Extract user-provided styles
    let userStyleIndex = 0
    for (let i = 1; i < contents.length; i++) {
      if (
        userStyleIndex < userProvidedStyleCount &&
        typeof contents[i] === 'string' &&
        (contents[i].includes('color:') || contents[i].includes('background:') || contents[i].includes('font-'))
      ) {
        userStyles.push(contents[i])
        userStyleIndex++
      } else {
        otherContents.push(contents[i])
      }
    }

    // Merge styles: Since HTML tags are converted first, tagStyles come first in the array
    // Then userStyles follow. This works correctly when HTML tags appear before user %c in the string.
    // Note: For best results, use HTML tags and %c separately, or ensure HTML tags come before user %c
    const allStyles = [...tagStyles, ...userStyles]

    // Combine prefix with processed text
    const combinedString = `${prefixText} ${processedText}`
    const combinedStyles = [prefixStyle, ...allStyles]

    return [combinedString, ...combinedStyles, ...otherContents]
  }

  // If we have tagStyles but no %c in final text (shouldn't happen, but handle it)
  if (tagStyles.length > 0) {
    const combinedString = `${prefixText} ${processedText}`
    const combinedStyles = [prefixStyle, ...tagStyles]
    return [combinedString, ...combinedStyles, ...contents.slice(1)]
  }

  // No %c or tags in contents, just append contents after prefix
  return [prefixText, prefixStyle, ...contents]
}

/**
 * Create logging functions with a module prefix
 * @param prefix Prefix to add to log messages (e.g., module name)
 * @returns Object containing logging functions with module prefix
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createGMELogger(prefix?: string) {
  const modulePrefix = prefix && prefix.trim() ? `[${prefix.trim()}]` : ''

  return {
    /**
     * Log success message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_ok('User:', '%cJohn', 'color: blue')
     * GME_ok('User: <b>John</b>')
     * GME_ok('Status: <green>Active</green>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_ok(...contents: any[]) {
      const args = processLogContents(`%c✔ [OK]${modulePrefix}`, 'color:#28a745;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log info message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_info('Status:', '%cActive', 'color: green')
     * GME_info('Status: <b>Active</b>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_info(...contents: any[]) {
      const args = processLogContents(`%cℹ [INFO]${modulePrefix}`, 'color:#17a2b8;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log error message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_fail('Error:', '%cFailed', 'color: red; font-weight: bold')
     * GME_fail('Error: <red>Failed</red>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_fail(...contents: any[]) {
      const args = processLogContents(`%c✘ [FAIL]${modulePrefix}`, 'color:#dc3545;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log warning message with module prefix
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_warn('Warning:', '%cDeprecated', 'color: orange')
     * GME_warn('Warning: <yellow>Deprecated</yellow>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_warn(...contents: any[]) {
      const args = processLogContents(`%c⚠ [WARN]${modulePrefix}`, 'color:#ffc107;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.log(...args)
    },

    /**
     * Log debug message with module prefix
     * Uses console.debug which is typically hidden in Chrome by default
     * Supports %c styling and HTML-like tags in contents
     * @example
     * GME_debug('Debug:', '%cValue', 'color: gray')
     * GME_debug('Debug: <gray>Value</gray>')
     * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
     */
    GME_debug(...contents: any[]) {
      const args = processLogContents(`%c🔍 [DEBUG]${modulePrefix}`, 'color:#6c757d;font-weight:700;', ...contents)
      // eslint-disable-next-line no-console
      console.debug(...args)
    },
  }
}

// Default logging functions (for backward compatibility and core scripts)
/**
 * Log success message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_ok('User:', '%cJohn', 'color: blue')
 * GME_ok('User: <b>John</b>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_ok(...contents: any[]) {
  const args = processLogContents('%c✔ [OK]', 'color:#28a745;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log info message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_info('Status:', '%cActive', 'color: green')
 * GME_info('Status: <green>Active</green>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_info(...contents: any[]) {
  const args = processLogContents('%cℹ [INFO]', 'color:#17a2b8;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log error message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_fail('Error:', '%cFailed', 'color: red; font-weight: bold')
 * GME_fail('Error: <red>Failed</red>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_fail(...contents: any[]) {
  const args = processLogContents('%c✘ [FAIL]', 'color:#dc3545;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log warning message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_warn('Warning:', '%cDeprecated', 'color: orange')
 * GME_warn('Warning: <yellow>Deprecated</yellow>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_warn(...contents: any[]) {
  const args = processLogContents('%c⚠ [WARN]', 'color:#ffc107;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.log(...args)
}

/**
 * Log debug message
 * Uses console.debug which is typically hidden in Chrome by default
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_debug('Debug:', '%cValue', 'color: gray')
 * GME_debug('Debug: <gray>Value</gray>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_debug(...contents: any[]) {
  const args = processLogContents('%c🔍 [DEBUG]', 'color:#6c757d;font-weight:700;', ...contents)
  // eslint-disable-next-line no-console
  console.debug(...args)
}
