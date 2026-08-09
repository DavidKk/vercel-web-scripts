/** Shared DevTools `%c` styling for MagickMonkey console logs (preset + extension). */
export type VwsConsoleLogLevel = 'debug' | 'info' | 'ok' | 'warn' | 'fail' | 'error'

const LEVEL_LABEL: Record<VwsConsoleLogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  ok: 'OK',
  warn: 'WARN',
  fail: 'FAIL',
  error: 'ERROR',
}

/** Tier 1: badge only — background, no extra spaces inside `%c` text. */
const BADGE_STYLE = 'background:#4f46e5;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700;font-size:10px;'

/** Tier 2a: level text color only (no background). */
const LEVEL_STYLE: Record<VwsConsoleLogLevel, string> = {
  debug: 'color:#6b7280;font-weight:600;',
  info: 'color:#0891b2;font-weight:600;',
  ok: 'color:#16a34a;font-weight:600;',
  warn: 'color:#ca8a04;font-weight:600;',
  fail: 'color:#dc2626;font-weight:600;',
  error: 'color:#dc2626;font-weight:600;',
}

/** Tier 2b: scope text color only (no background). */
const SCOPE_STYLE = 'color:#7c3aed;font-weight:600;'

/** Tier 2c: short TraceId color. */
const TRACE_STYLE = 'color:#64748b;font-weight:600;font-size:10px;'

const MESSAGE_RESET = 'color:inherit;font-weight:normal;'

export interface VwsConsolePrefix {
  format: string
  styles: string[]
}

export type BuildVwsConsolePrefixOptions = {
  /** Short (8-char) TraceId shown after scope when present */
  shortTrace?: string
}

/**
 * Count `%c` placeholders — must equal `styles.length`.
 * @param format Console format string
 * @returns Number of `%c` specifiers
 */
export function countVwsConsoleFormatSpecifiers(format: string): number {
  return (format.match(/%c/g) ?? []).length
}

/**
 * Plain meta label: `INFO Launcher` or `INFO Launcher a1b2c3d4` (for log-store preview).
 * @param scope Logger scope
 * @param level Log level
 * @param shortTrace Optional short TraceId
 * @returns Meta segment text
 */
export function buildVwsConsoleMeta(scope: string, level: VwsConsoleLogLevel, shortTrace?: string): string {
  const base = `${LEVEL_LABEL[level]} ${scope.trim()}`
  const trace = shortTrace?.trim()
  return trace ? `${base} ${trace}` : base
}

/**
 * Tier 1+2 in one format string (badge + colored level + colored scope [+ short trace]).
 * No trailing space — tier 3 message is separate console args (one DevTools space).
 * @param scope Logger scope
 * @param level Log level
 * @param options Optional short TraceId
 * @returns Prefix format with matching styles
 */
export function buildVwsConsolePrefix(scope: string, level: VwsConsoleLogLevel, options?: BuildVwsConsolePrefixOptions): VwsConsolePrefix {
  const shortTrace = options?.shortTrace?.trim()
  if (shortTrace) {
    return {
      format: `%cVWS%c %c${LEVEL_LABEL[level]}%c %c${scope.trim()}%c %c${shortTrace}%c`,
      styles: [BADGE_STYLE, MESSAGE_RESET, LEVEL_STYLE[level], MESSAGE_RESET, SCOPE_STYLE, MESSAGE_RESET, TRACE_STYLE, MESSAGE_RESET],
    }
  }
  return {
    format: `%cVWS%c %c${LEVEL_LABEL[level]}%c %c${scope.trim()}%c`,
    styles: [BADGE_STYLE, MESSAGE_RESET, LEVEL_STYLE[level], MESSAGE_RESET, SCOPE_STYLE, MESSAGE_RESET],
  }
}

/**
 * Plain-text preview: `VWS INFO Launcher message…`
 * @param scope Logger scope
 * @param level Log level
 * @param messageParts Tier-3 message segments
 * @returns Single-line plain text
 */
export function formatVwsConsolePlainText(scope: string, level: VwsConsoleLogLevel, ...messageParts: unknown[]): string {
  const body = messageParts
    .map((part) => {
      if (part === undefined || part === null) return ''
      return typeof part === 'string' ? part : String(part)
    })
    .filter(Boolean)
    .join(' ')
  const head = ['VWS', buildVwsConsoleMeta(scope, level)].join(' ')
  return body ? `${head} ${body}` : head
}

/**
 * Console args: tier 1+2 (styled prefix) then tier 3 message parts.
 * @param scope Logger scope
 * @param level Log level
 * @param messageParts Tier-3 message body
 * @returns Spread into `console.log` / `console.info`
 */
export function buildVwsConsoleLogArgs(scope: string, level: VwsConsoleLogLevel, ...messageParts: unknown[]): unknown[] {
  const { format, styles } = buildVwsConsolePrefix(scope, level)
  return [format, ...styles, ...messageParts]
}

/**
 * Console args with an explicit short TraceId in the prefix.
 * @param scope Logger scope
 * @param level Log level
 * @param shortTrace Eight-char TraceId (or empty/undefined to omit)
 * @param messageParts Tier-3 message body
 * @returns Spread into console sinks
 */
export function buildVwsConsoleLogArgsWithTrace(scope: string, level: VwsConsoleLogLevel, shortTrace: string | undefined, ...messageParts: unknown[]): unknown[] {
  const { format, styles } = buildVwsConsolePrefix(scope, level, shortTrace ? { shortTrace } : undefined)
  return [format, ...styles, ...messageParts]
}
