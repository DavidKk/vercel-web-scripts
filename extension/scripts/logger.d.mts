export type ScriptLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createScriptLogger(scope: string): ScriptLogger
