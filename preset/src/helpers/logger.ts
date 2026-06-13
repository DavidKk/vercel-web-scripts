// ============================================================================
// Logging Functions
// ============================================================================

import { DEBUG_LOG_MESSAGE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE, SCRIPT_FAILED_MESSAGE_TYPE, SCRIPT_TRIGGERED_MESSAGE_TYPE } from '@shared/launcher-constants'
import { parseScriptExecutingFailureLog, parseScriptExecutingLog } from '@shared/script-trigger-log'
import { buildVwsConsoleLogArgs, buildVwsConsolePrefix, type VwsConsoleLogLevel } from '@shared/vws-console-log-styles'

import { logStore } from '@/services/log-store'
import { shouldLogToConsole, shouldLogToMemory } from '@/services/shell-log-settings'

type GmeStoreLevel = 'ok' | 'info' | 'warn' | 'fail' | 'debug'
type DebugLogLevel = 'debug' | 'info' | 'ok' | 'warn' | 'error'

function readActiveScriptKey(pageConfig: { scriptKey?: string } | undefined): string | undefined {
  const runtimeKey = (globalThis as { __VWS_SCRIPT_KEY__?: unknown }).__VWS_SCRIPT_KEY__
  if (typeof runtimeKey === 'string' && runtimeKey.trim()) {
    return runtimeKey.trim()
  }
  if (typeof pageConfig?.scriptKey === 'string' && pageConfig.scriptKey.trim()) {
    return pageConfig.scriptKey.trim()
  }
  return undefined
}

function notifyExtensionScriptTriggered(contents: unknown[]): void {
  if (typeof window === 'undefined') {
    return
  }
  const pageConfig = (window as Window & { __VWS_PAGE_CONFIG__?: { scriptKey?: string } }).__VWS_PAGE_CONFIG__
  if (!pageConfig) {
    return
  }
  const file = parseScriptExecutingLog(contents[0])
  if (!file) {
    return
  }
  const scriptKey = readActiveScriptKey(pageConfig)
  try {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
        type: SCRIPT_TRIGGERED_MESSAGE_TYPE,
        payload: { file, runAt: 'executed', scriptKey },
      },
      '*'
    )
  } catch {
    // ignore bridge errors
  }
}

function notifyExtensionScriptFailed(contents: unknown[]): void {
  if (typeof window === 'undefined') {
    return
  }
  const pageConfig = (window as Window & { __VWS_PAGE_CONFIG__?: unknown }).__VWS_PAGE_CONFIG__
  if (!pageConfig) {
    return
  }
  const file = parseScriptExecutingFailureLog(contents[0])
  if (!file) {
    return
  }
  try {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
        type: SCRIPT_FAILED_MESSAGE_TYPE,
        payload: { file, runAt: 'failed' },
      },
      '*'
    )
  } catch {
    // ignore bridge errors
  }
}

function isExtensionPageContext(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return Boolean((window as Window & { __VWS_PAGE_CONFIG__?: unknown }).__VWS_PAGE_CONFIG__)
}

function forwardExtensionDebugLog(source: 'page' | 'inject', scope: string, storeLevel: GmeStoreLevel, ...contents: any[]): void {
  if (!shouldLogToMemory() || !isExtensionPageContext()) {
    return
  }
  const message = formatContentsForStore(...contents)
  if (!message) {
    return
  }
  const level: DebugLogLevel = storeLevel === 'fail' ? 'error' : storeLevel
  try {
    window.postMessage(
      {
        source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
        type: DEBUG_LOG_MESSAGE_TYPE,
        payload: {
          source,
          scope,
          level,
          message,
        },
      },
      '*'
    )
  } catch {
    // ignore bridge errors
  }
}

/**
 * Format log contents to a plain string for log store (strip %c, styles, HTML-like tags)
 */
function formatContentsForStore(...contents: any[]): string {
  const parts: string[] = []
  for (let i = 0; i < contents.length; i++) {
    const c = contents[i]
    if (typeof c === 'string') {
      if (c.includes('color:') || c.includes('font-') || c.includes('background:')) continue
      let s = c.replace(/%c/g, '').replace(/<(\w+)>([^<]*)<\/\1>/gi, '$2')
      if (s.trim()) parts.push(s)
    } else {
      try {
        parts.push(typeof c === 'object' && c !== null ? JSON.stringify(c) : String(c))
      } catch {
        parts.push(String(c))
      }
    }
  }
  return parts.join(' ').trim() || ''
}

/**
 * Push to log store if available (log-store.ts must be loaded before logger)
 */
function pushToLogStore(level: 'ok' | 'info' | 'warn' | 'fail' | 'debug', ...contents: any[]): void {
  if (!shouldLogToMemory()) {
    return
  }
  try {
    const store = logStore
    if (store && typeof store.push === 'function') {
      const msg = formatContentsForStore(...contents)
      if (msg) store.push(level, msg)
    }
  } catch (e) {
    if (!shouldLogToConsole()) {
      return
    }
    // eslint-disable-next-line no-console -- log store write failure must be visible (logger must not throw)
    console.error('[logger] writeToStore failed:', e)
  }
}

/** Stack of module scopes; bare `GME_*` in the innermost scope route to {@link emitScriptLog}. */
const activeScriptLogScopeStack: string[] = []

function currentScriptLogScope(): string | null {
  const depth = activeScriptLogScopeStack.length
  return depth > 0 ? activeScriptLogScopeStack[depth - 1] : null
}

/**
 * Begin user-script log scope (wrapper calls before compiled module body).
 * Framework wrapper lines such as "Executing script …" must run outside this scope.
 * @param scope Module namespace shown in log prefix
 */
export function enterScriptLogScope(scope: string): void {
  activeScriptLogScopeStack.push(scope?.trim() || 'Script')
}

/** End user-script log scope opened by {@link enterScriptLogScope}. */
export function exitScriptLogScope(): void {
  if (activeScriptLogScopeStack.length > 0) {
    activeScriptLogScopeStack.pop()
  }
}

function writeGmeToConsole(scope: string, level: VwsConsoleLogLevel, storeLevel: GmeStoreLevel, ...contents: any[]): void {
  const args = processLogContents(scope, level, ...contents)
  if (storeLevel === 'debug') {
    // eslint-disable-next-line no-console
    console.debug(...args)
    return
  }
  // eslint-disable-next-line no-console
  console.log(...args)
}

function emitGmeLog(scope: string, level: VwsConsoleLogLevel, storeLevel: GmeStoreLevel, ...contents: any[]): void {
  const scriptScope = currentScriptLogScope()
  if (scriptScope !== null) {
    emitScriptLog(scriptScope, level, storeLevel, ...contents)
    return
  }
  if (storeLevel === 'ok') {
    notifyExtensionScriptTriggered(contents)
  }
  if (storeLevel === 'fail') {
    notifyExtensionScriptFailed(contents)
  }
  if (shouldLogToConsole()) {
    writeGmeToConsole(scope, level, storeLevel, ...contents)
  }
  if (shouldLogToMemory()) {
    pushToLogStore(storeLevel, ...contents)
  }
  forwardExtensionDebugLog('page', scope, storeLevel, ...contents)
}

/**
 * User GIST script logs — always console; not gated by shell Logger output mode.
 * @param scope Module name prefix
 * @param level Styled console level
 * @param storeLevel Log store level
 * @param contents Log payload
 */
function emitScriptLog(scope: string, level: VwsConsoleLogLevel, storeLevel: GmeStoreLevel, ...contents: any[]): void {
  if (storeLevel === 'ok') {
    notifyExtensionScriptTriggered(contents)
  }
  if (storeLevel === 'fail') {
    notifyExtensionScriptFailed(contents)
  }
  writeGmeToConsole(scope, level, storeLevel, ...contents)
  if (shouldLogToMemory()) {
    pushToLogStore(storeLevel, ...contents)
  }
  forwardExtensionDebugLog('page', scope, storeLevel, ...contents)
}

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
 * Merges VWS prefix with user-provided styles in contents
 * Supports both %c syntax and HTML-like tags (<b>, <i>, <u>, <s>, <red>, etc.)
 * Can be used together: HTML tags are converted first, then %c syntax is processed
 * Note: For best results when mixing, place HTML tags before user %c in the string
 * @param scope Logger scope shown after the VWS badge (e.g. "Preset" or script name)
 * @param level Log severity for the styled level label
 * @param contents User-provided contents (may contain %c, styles, or HTML-like tags)
 * @returns Array of processed arguments for console.log
 */
function processLogContents(scope: string, level: VwsConsoleLogLevel, ...contents: any[]): any[] {
  if (contents.length === 0) {
    const { format, styles } = buildVwsConsolePrefix(scope, level)
    return [format, ...styles]
  }

  const firstContent = contents[0]
  if (typeof firstContent !== 'string') {
    return buildVwsConsoleLogArgs(scope, level, ...contents)
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
    const { format: prefixText, styles: prefixStyles } = buildVwsConsolePrefix(scope, level)
    const combinedString = `${prefixText} ${processedText}`
    const combinedStyles = [...prefixStyles, ...allStyles]

    return [combinedString, ...combinedStyles, ...otherContents]
  }

  // If we have tagStyles but no %c in final text (shouldn't happen, but handle it)
  if (tagStyles.length > 0) {
    const { format: prefixText, styles: prefixStyles } = buildVwsConsolePrefix(scope, level)
    const combinedString = `${prefixText} ${processedText}`
    const combinedStyles = [...prefixStyles, ...tagStyles]
    return [combinedString, ...combinedStyles, ...contents.slice(1)]
  }

  return buildVwsConsoleLogArgs(scope, level, ...contents)
}

/**
 * Scoped GME_* logger for preset / shell runtime (respects Logger output mode).
 * @param prefix Optional prefix to add to log messages (e.g., module name)
 * @returns Object containing logging functions with module prefix
 */
export function createGMELogger(prefix?: string) {
  const scope = prefix?.trim() || 'Preset'

  return {
    GME_ok(...contents: any[]) {
      emitGmeLog(scope, 'ok', 'ok', ...contents)
    },
    GME_info(...contents: any[]) {
      emitGmeLog(scope, 'info', 'info', ...contents)
    },
    GME_fail(...contents: any[]) {
      emitGmeLog(scope, 'fail', 'fail', ...contents)
    },
    GME_warn(...contents: any[]) {
      emitGmeLog(scope, 'warn', 'warn', ...contents)
    },
    GME_debug(...contents: any[]) {
      emitGmeLog(scope, 'debug', 'debug', ...contents)
    },
  }
}

export type ScriptLogger = {
  script_ok: (...contents: any[]) => void
  script_info: (...contents: any[]) => void
  script_warn: (...contents: any[]) => void
  script_fail: (...contents: any[]) => void
  script_debug: (...contents: any[]) => void
}

/**
 * Scoped script_* logger for user GIST modules (always console; use in script wrapper).
 * @param prefix Module name shown in log prefix
 * @returns Script logging functions — not affected by Logger Console/Viewer/Off
 */
export function createScriptLogger(prefix?: string): ScriptLogger {
  const scope = prefix?.trim() || 'Script'

  return {
    script_ok(...contents: any[]) {
      emitScriptLog(scope, 'ok', 'ok', ...contents)
    },
    script_info(...contents: any[]) {
      emitScriptLog(scope, 'info', 'info', ...contents)
    },
    script_warn(...contents: any[]) {
      emitScriptLog(scope, 'warn', 'warn', ...contents)
    },
    script_fail(...contents: any[]) {
      emitScriptLog(scope, 'fail', 'fail', ...contents)
    },
    script_debug(...contents: any[]) {
      emitScriptLog(scope, 'debug', 'debug', ...contents)
    },
  }
}

export type ScriptGMELogger = {
  GME_ok: (...contents: any[]) => void
  GME_info: (...contents: any[]) => void
  GME_warn: (...contents: any[]) => void
  GME_fail: (...contents: any[]) => void
  GME_debug: (...contents: any[]) => void
}

/**
 * User GIST script logger as `GME_*` (always console; not affected by Logger mode).
 * Used by remote script wrappers and legacy sources; same behavior as {@link createScriptLogger}.
 * @param prefix Module name shown in log prefix
 */
export function createScriptGMELogger(prefix?: string): ScriptGMELogger {
  const { script_ok, script_info, script_warn, script_fail, script_debug } = createScriptLogger(prefix)
  return {
    GME_ok: script_ok,
    GME_info: script_info,
    GME_warn: script_warn,
    GME_fail: script_fail,
    GME_debug: script_debug,
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
export function GME_ok(...contents: any[]) {
  emitGmeLog('Preset', 'ok', 'ok', ...contents)
}

/**
 * Log info message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_info('Status:', '%cActive', 'color: green')
 * GME_info('Status: <green>Active</green>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
export function GME_info(...contents: any[]) {
  emitGmeLog('Preset', 'info', 'info', ...contents)
}

/**
 * Log error message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_fail('Error:', '%cFailed', 'color: red; font-weight: bold')
 * GME_fail('Error: <red>Failed</red>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
export function GME_fail(...contents: any[]) {
  emitGmeLog('Preset', 'fail', 'fail', ...contents)
}

/**
 * Log warning message
 * Supports %c styling and HTML-like tags in contents
 * @example
 * GME_warn('Warning:', '%cDeprecated', 'color: orange')
 * GME_warn('Warning: <yellow>Deprecated</yellow>')
 * @param contents Messages to log (can include %c for styling or HTML-like tags like <b>, <i>, <red>, etc.)
 */
export function GME_warn(...contents: any[]) {
  emitGmeLog('Preset', 'warn', 'warn', ...contents)
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
export function GME_debug(...contents: any[]) {
  emitGmeLog('Preset', 'debug', 'debug', ...contents)
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

    if (shouldLogToConsole()) {
      // eslint-disable-next-line no-console
      console.log(...buildVwsConsoleLogArgs(scriptName, 'info', `▶ ${label}`))
    }
  }

  /**
   * Internal method to log and collect
   * @param type Console method type
   * @param level Styled VWS log level
   * @param contents Log contents
   * @returns This instance for chaining
   */
  private log(type: 'log' | 'debug' | 'warn' | 'error', level: VwsConsoleLogLevel, ...contents: any[]): GroupLogger {
    const args = processLogContents(this.scriptName, level, ...contents)

    if (shouldLogToConsole()) {
      // eslint-disable-next-line no-console
      console[type](...args)
    }

    this.logs.push({ type, args })

    return this
  }

  /**
   * Log info message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  info(...contents: any[]): GroupLogger {
    return this.log('log', 'info', ...contents)
  }

  /**
   * Log success message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  ok(...contents: any[]): GroupLogger {
    return this.log('log', 'ok', ...contents)
  }

  /**
   * Log warning message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  warn(...contents: any[]): GroupLogger {
    return this.log('warn', 'warn', ...contents)
  }

  /**
   * Log error message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  fail(...contents: any[]): GroupLogger {
    return this.log('error', 'fail', ...contents)
  }

  /**
   * Log debug message within the group
   * @param contents Messages to log
   * @returns This instance for chaining
   */
  debug(...contents: any[]): GroupLogger {
    return this.log('debug', 'debug', ...contents)
  }

  /**
   * End the group and output summary
   * Creates a collapsible group showing all collected logs
   */
  end(): void {
    if (!shouldLogToConsole()) {
      return
    }
    const duration = Date.now() - this.startTime
    const logCount = this.logs.length

    // eslint-disable-next-line no-console
    console.groupCollapsed(...buildVwsConsoleLogArgs(this.scriptName, 'info', `${this.label} · ${logCount} logs · ${duration}ms`))

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
export function GME_group(label: string): GroupLogger {
  const scriptName = typeof GM_info !== 'undefined' && GM_info?.script?.name ? GM_info.script.name : 'Unknown Script'
  return new LogGroup(label, scriptName)
}
