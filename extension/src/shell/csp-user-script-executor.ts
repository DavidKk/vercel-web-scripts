import { buildPresetWithWindowScriptSource, buildWithGlobalStagedScriptSource, isCspEvalError } from '@shared/csp-script-executor'

export const CSP_RELOAD_SCHEDULED_MESSAGE = 'CSP_RELOAD_SCHEDULED'

/** Whether the User Scripts API is enabled (permission + chrome://extensions toggle). */
export function isUserScriptsApiAvailable(): boolean {
  try {
    chrome.userScripts.getScripts()
    return typeof chrome.userScripts.execute === 'function'
  } catch {
    return false
  }
}

export type UserScriptExecuteMode = 'preset' | 'global'

export type MainWorldExecuteResult = { ok: true } | { ok: false; cspBlocked: true; message: string } | { ok: false; cspBlocked: false; message: string }

function formatInjectionErrors(results: chrome.userScripts.InjectionResult[]): string | null {
  const messages = results.map((result) => result.error).filter((error): error is string => Boolean(error))
  if (messages.length === 0) {
    return null
  }
  return messages.join('; ')
}

/**
 * Run dynamic preset/script in page MAIN world (customElements + DOM APIs require MAIN, not USER_SCRIPT).
 * Returns cspBlocked when page CSP still blocks injection (caller may reload after DNR).
 */
export async function executeInMainWorldScript(
  tabId: number,
  mode: UserScriptExecuteMode,
  source: { decls: string; presetCode: string } | { withBody: string }
): Promise<MainWorldExecuteResult> {
  if (!isUserScriptsApiAvailable()) {
    return {
      ok: false,
      cspBlocked: false,
      message: 'User Scripts API unavailable — open chrome://extensions, click extension Details, and enable "Allow User Scripts"',
    }
  }

  const code =
    mode === 'preset'
      ? buildPresetWithWindowScriptSource((source as { decls: string; presetCode: string }).decls, (source as { decls: string; presetCode: string }).presetCode)
      : buildWithGlobalStagedScriptSource((source as { withBody: string }).withBody)

  try {
    const results = await chrome.userScripts.execute({
      target: { tabId },
      world: 'MAIN',
      injectImmediately: true,
      js: [{ code }],
    })
    const injectionError = formatInjectionErrors(results)
    if (injectionError) {
      const cspBlocked = isCspEvalError(new Error(injectionError))
      return { ok: false, cspBlocked, message: injectionError }
    }
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, cspBlocked: isCspEvalError(error), message }
  }
}
