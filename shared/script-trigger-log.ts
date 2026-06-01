/**
 * GIST script execution log format (compile wrapper + extension badge fallback).
 * Keep in sync: changing this string requires updating {@link parseScriptExecutingLog}.
 */

/**
 * Build the `GME_ok` line emitted when a remote module enters its execution branch.
 * @param file Managed script filename
 * @param builtAtDisplay Human-readable build time for logs
 */
export function formatScriptExecutingLog(file: string, builtAtDisplay: string): string {
  return `Executing script \`${file}\` (built ${builtAtDisplay})`
}

const SCRIPT_EXECUTING_LOG_RE = /^Executing script `([^`]+)`/

/**
 * Parse script filename from the first `GME_ok` argument of an execution log line.
 * @param first First log argument passed to `GME_ok`
 */
export function parseScriptExecutingLog(first: unknown): string | null {
  if (typeof first !== 'string') {
    return null
  }
  return SCRIPT_EXECUTING_LOG_RE.exec(first)?.[1] ?? null
}

/**
 * Build the `GME_fail` prefix when a remote module throws during execution.
 * @param file Managed script filename
 */
export function formatScriptExecutingFailureLog(file: string): string {
  return `Executing script \`${file}\` failed:`
}

const SCRIPT_EXECUTING_FAILURE_LOG_RE = /^Executing script `([^`]+)` failed:/

/**
 * Parse script filename from a failed-execution `GME_fail` line.
 * @param first First log argument passed to `GME_fail`
 */
export function parseScriptExecutingFailureLog(first: unknown): string | null {
  if (typeof first !== 'string') {
    return null
  }
  return SCRIPT_EXECUTING_FAILURE_LOG_RE.exec(first)?.[1] ?? null
}
