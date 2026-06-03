/** Temporary global for nonce-based dynamic script execution (CSP-safe fallback). */
export const CSP_EXEC_GLOBAL_KEY = '__VWS_CSP_EXEC_G__'

const CSP_EVAL_RE = /unsafe-eval|Content Security Policy/i

/** How dynamic script code was executed in the page context. */
export type CspScriptExecuteMode = 'function' | 'nonce-script'

/**
 * Whether an error is caused by page CSP blocking eval / Function constructor.
 * @param error Caught execution error
 */
export function isCspEvalError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.name === 'EvalError' || CSP_EVAL_RE.test(error.message)
}

/**
 * Read a script-src nonce from an existing same-document script tag (required on strict CSP sites).
 */
export function getPageScriptNonce(): string | null {
  if (typeof document === 'undefined') {
    return null
  }
  const tagged = document.querySelector('script[nonce]') as HTMLScriptElement | null
  if (tagged) {
    const value = tagged.nonce || tagged.getAttribute('nonce')
    if (value) {
      return value
    }
  }
  return null
}

/**
 * Prevent inline script text from terminating the wrapping &lt;script&gt; element.
 * @param code Script source
 */
export function escapeInlineScriptText(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script')
}

/**
 * Build grants object from `__GRANTS_STRING__` without eval (spread-of-GM_* pattern).
 * @param host Global object that may already expose GM_* APIs
 * @param grantsString Value of `__GRANTS_STRING__` from launcher globals
 */
export function buildGrantsFromGlobal(host: Record<string, unknown>, grantsString: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const re = /\.\.\.\(typeof\s+(\w+)\s*!==\s*['"]undefined['"]\s*\?\s*\{\s*\1\s*\}\s*:\s*\{\}\)/g
  let match = re.exec(grantsString)
  while (match) {
    const name = match[1]
    if (name in host) {
      out[name] = host[name]
    } else {
      const root = globalThis as Record<string, unknown>
      if (name in root) {
        out[name] = root[name]
      }
    }
    match = re.exec(grantsString)
  }
  return out
}

/**
 * Build classic-script source that runs code inside `with(global){...}`.
 * @param withBody Body inside the with block (no outer braces)
 */
export function buildWithGlobalScriptSource(withBody: string): string {
  const inner = escapeInlineScriptText(`with(global){${withBody}}`)
  return `(function(){var global=window[${JSON.stringify(CSP_EXEC_GLOBAL_KEY)}];try{${inner}}finally{delete window[${JSON.stringify(CSP_EXEC_GLOBAL_KEY)}];}})();`
}

/**
 * Execute code via a nonce-bearing inline script (no unsafe-eval).
 * @param global Sandbox object used as `with(global)` target
 * @param withBody Body inside the with block
 */
export function runWithGlobalViaNonceScript(global: Record<string, unknown>, withBody: string): void {
  const nonce = getPageScriptNonce()
  if (!nonce) {
    throw new Error('CSP blocked eval and page has no script nonce for inline fallback')
  }
  const root = document.documentElement || document.head || document.body
  if (!root) {
    throw new Error('document not ready for script injection')
  }

  const host = globalThis as Record<string, unknown>
  host[CSP_EXEC_GLOBAL_KEY] = global
  const script = document.createElement('script')
  script.nonce = nonce
  script.textContent = buildWithGlobalScriptSource(withBody)
  root.appendChild(script)
  script.remove()
  if (CSP_EXEC_GLOBAL_KEY in host) {
    delete host[CSP_EXEC_GLOBAL_KEY]
  }
}

/**
 * Run code in page context with `with(global){body}`: Function first, nonce inline script on CSP eval errors.
 * @param global Sandbox object
 * @param withBody Body inside the with block
 */
export function executeWithGlobal(global: Record<string, unknown>, withBody: string): CspScriptExecuteMode {
  try {
    new Function('global', `with(global){${withBody}}`)(global)
    return 'function'
  } catch (error) {
    if (!isCspEvalError(error)) {
      throw error
    }
    runWithGlobalViaNonceScript(global, withBody)
    return 'nonce-script'
  }
}

/**
 * Build preset launcher script: `with(g){decls + presetCode}`.
 * @param decls Variable declarations mapping preset globals from g
 * @param presetCode OTA preset body
 */
export function buildPresetWithGScriptSource(decls: string, presetCode: string): string {
  const inner = escapeInlineScriptText(`with(g) {\n${decls}\n${presetCode}\n}`)
  return `(function(){var g=window[${JSON.stringify(CSP_EXEC_GLOBAL_KEY)}];try{${inner}}finally{delete window[${JSON.stringify(CSP_EXEC_GLOBAL_KEY)}];}})();`
}

/**
 * Execute OTA preset in page context (launcher): Function first, nonce script on CSP eval errors.
 * @param g Launcher sandbox globals
 * @param decls Variable declarations for preset bare identifiers
 * @param presetCode OTA preset body
 */
export function executePresetWithG(g: Record<string, unknown>, decls: string, presetCode: string): CspScriptExecuteMode {
  const body = `with(g) {\n${decls}\n${presetCode}\n}`
  try {
    new Function('g', body)(g)
    return 'function'
  } catch (error) {
    if (!isCspEvalError(error)) {
      throw error
    }
    const nonce = getPageScriptNonce()
    if (!nonce) {
      throw new Error('CSP blocked eval and page has no script nonce for inline fallback')
    }
    const root = document.documentElement || document.head || document.body
    if (!root) {
      throw new Error('document not ready for preset script injection')
    }
    const host = globalThis as Record<string, unknown>
    host[CSP_EXEC_GLOBAL_KEY] = g
    const script = document.createElement('script')
    script.nonce = nonce
    script.textContent = buildPresetWithGScriptSource(decls, presetCode)
    root.appendChild(script)
    script.remove()
    if (CSP_EXEC_GLOBAL_KEY in host) {
      delete host[CSP_EXEC_GLOBAL_KEY]
    }
    return 'nonce-script'
  }
}
