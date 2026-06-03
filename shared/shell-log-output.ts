/** GM storage key for shell log output destination (global, not per scriptKey). */
export const SHELL_LOG_OUTPUT_MODE_KEY = 'vws_shell_log_output_mode'

/** Where preset / shell logs are emitted. */
export type ShellLogOutputMode = 'console' | 'logviewer' | 'none'

/** Default: styled console + in-memory log store (view in Log Viewer). */
export const DEFAULT_SHELL_LOG_OUTPUT_MODE: ShellLogOutputMode = 'console'

const VALID_MODES: ReadonlySet<ShellLogOutputMode> = new Set(['console', 'logviewer', 'none'])

/**
 * Normalize a stored or unknown value to a valid {@link ShellLogOutputMode}.
 * @param raw Value from GM storage
 */
export function normalizeShellLogOutputMode(raw: unknown): ShellLogOutputMode {
  if (typeof raw === 'string' && VALID_MODES.has(raw as ShellLogOutputMode)) {
    return raw as ShellLogOutputMode
  }
  return DEFAULT_SHELL_LOG_OUTPUT_MODE
}

/**
 * Whether logs should be written to the browser console.
 */
export function shouldLogToConsoleForMode(mode: ShellLogOutputMode): boolean {
  return mode === 'console'
}

/**
 * Whether logs should be recorded in the in-memory log store (Log Viewer).
 */
export function shouldLogToMemoryForMode(mode: ShellLogOutputMode): boolean {
  return mode !== 'none'
}
