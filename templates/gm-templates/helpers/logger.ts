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

// ============================================================================
// Log Group Functions
// ============================================================================

/**
 * Group logger interface
 * Provides methods to log within a group and end the group
 */
interface GroupLogger {
  /** Log info message within the group */
  info(...contents: any[]): GroupLogger
  /** Log success message within the group */
  ok(...contents: any[]): GroupLogger
  /** Log warning message within the group */
  warn(...contents: any[]): GroupLogger
  /** Log error message within the group */
  fail(...contents: any[]): GroupLogger
  /** Log debug message within the group */
  debug(...contents: any[]): GroupLogger
  /** End the group and output summary */
  end(): void
}

/**
 * Log group class
 * Collects logs and outputs them in a collapsible group
 */
class LogGroup implements GroupLogger {
  private label: string
  private scriptName: string
  private logs: Array<{ type: 'log' | 'debug' | 'warn' | 'error'; args: any[] }> = []
  private startTime: number

  /**
   * Create a new log group
   * @param label Group label
   * @param scriptName Script name from GM_info
   */
  constructor(label: string, scriptName: string) {
    this.label = label
    this.scriptName = scriptName
    this.startTime = Date.now()

    // Immediately output start marker with script name
    const startLabel = `%c📦 [${scriptName}] ${label}`
    const startStyle = 'color: #6f42c1; font-weight: bold; font-size: 12px;'
    // eslint-disable-next-line no-console
    console.log(startLabel, startStyle)
  }

  /**
   * Internal method to log and collect
   * @param type Console method type
   * @param prefixText Prefix text with %c placeholder
   * @param prefixStyle Style for the prefix
   * @param contents Log contents
   * @returns This instance for chaining
   */
  private log(type: 'log' | 'debug' | 'warn' | 'error', prefixText: string, prefixStyle: string, ...contents: any[]): GroupLogger {
    const args = processLogContents(prefixText, prefixStyle, ...contents)

    // Immediately output (don't block)
    // eslint-disable-next-line no-console
    console[type](...args)

    // Also collect for summary
    this.logs.push({ type, args })

    return this
  }

  /**
   * Log info message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  info(...contents: any[]): GroupLogger {
    return this.log('log', '%cℹ [INFO]', 'color:#17a2b8;font-weight:700;', ...contents)
  }

  /**
   * Log success message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  ok(...contents: any[]): GroupLogger {
    return this.log('log', '%c✔ [OK]', 'color:#28a745;font-weight:700;', ...contents)
  }

  /**
   * Log warning message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  warn(...contents: any[]): GroupLogger {
    return this.log('warn', '%c⚠ [WARN]', 'color:#ffc107;font-weight:700;', ...contents)
  }

  /**
   * Log error message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  fail(...contents: any[]): GroupLogger {
    return this.log('error', '%c✘ [FAIL]', 'color:#dc3545;font-weight:700;', ...contents)
  }

  /**
   * Log debug message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  debug(...contents: any[]): GroupLogger {
    return this.log('debug', '%c🔍 [DEBUG]', 'color:#6c757d;font-weight:700;', ...contents)
  }

  /**
   * End the group and output summary
   * Creates a collapsible group showing all collected logs
   */
  end(): void {
    const duration = Date.now() - this.startTime
    const logCount = this.logs.length

    // Output summary in a collapsible group
    const summaryLabel = `%c📦 [${this.scriptName}] ${this.label} - ${logCount} logs in ${duration}ms`
    const summaryStyle = 'color: #6f42c1; font-weight: bold;'

    // eslint-disable-next-line no-console
    console.groupCollapsed(summaryLabel, summaryStyle)

    // Replay all collected logs
    this.logs.forEach(({ type, args }) => {
      // eslint-disable-next-line no-console
      console[type](...args)
    })

    // eslint-disable-next-line no-console
    console.groupEnd()
  }
}

/**
 * Create a log group
 * Returns a GroupLogger object with info, ok, warn, fail, debug, and end methods
 * Logs are immediately output and also collected for summary
 * @param label Group label
 * @returns GroupLogger instance
 * @example
 * const group = GME_group('User Authentication')
 * group.info('Fetching user data')
 * group.ok('User authenticated')
 * group.fail('Connection failed') // Immediately output, not blocked
 * group.end() // Output summary with all collected logs
 * @example
 * // Chain calls
 * GME_group('Processing Data')
 *   .info('Step 1')
 *   .ok('Step 2 completed')
 *   .end()
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GME_group(label: string): GroupLogger {
  const scriptName = typeof GM_info !== 'undefined' && GM_info?.script?.name ? GM_info.script.name : 'Unknown Script'
  return new LogGroup(label, scriptName)
}
