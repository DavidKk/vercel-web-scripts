import { CSP_EXTENSION_EXECUTE_EVENT, CSP_EXTENSION_EXECUTE_RESPONSE_TYPE, EXTENSION_BRIDGE_MESSAGE_SOURCE } from './launcher-constants'

/** Temporary global for preset-core dynamic execution (CSP-safe fallback). */
export const CSP_EXEC_PRESET_GLOBAL_KEY = '__VWS_CSP_PRESET_G__'
/** Temporary global for optional/global module dynamic execution (CSP-safe fallback). */
export const CSP_EXEC_MODULE_GLOBAL_KEY = '__VWS_CSP_MODULE_G__'
/** @deprecated Use the preset/module specific staging keys instead. */
export const CSP_EXEC_GLOBAL_KEY = CSP_EXEC_PRESET_GLOBAL_KEY

const CSP_EVAL_RE = /unsafe-eval|Content Security Policy/i
const TRUSTED_TYPES_ASSIGNMENT_RE = /Trusted(?:HTML|Script)/i

/** How dynamic script code was executed in the page context. */
export type CspScriptExecuteMode = 'function' | 'nonce-script' | 'user-script' | 'csp-reload'

/** Thrown when eval is blocked and no nonce exists; extension user-script API may still run the code. */
export class CspExtensionFallbackRequired extends Error {
  constructor() {
    super('CSP blocked eval and page has no script nonce for inline fallback')
    this.name = 'CspExtensionFallbackRequired'
  }
}

/** Thrown when extension user-script execution was already requested for this navigation. */
export class CspUserScriptExhausted extends Error {
  constructor() {
    super('User-script CSP fallback already attempted for this page load')
    this.name = 'CspUserScriptExhausted'
  }
}

const CSP_USER_SCRIPT_ATTEMPT_PREFIX = 'vws_csp_user_script:'

/** Per-document attempt set (resets on navigation; unlike sessionStorage which survives F5). */
const CSP_ATTEMPTS_WINDOW_KEY = '__VWS_CSP_USER_SCRIPT_ATTEMPTED__'

function getCspUserScriptAttemptSet(): Set<string> {
  if (typeof window === 'undefined') {
    return new Set()
  }
  const host = window as unknown as Record<string, unknown>
  let set = host[CSP_ATTEMPTS_WINDOW_KEY] as Set<string> | undefined
  if (!set) {
    set = new Set()
    host[CSP_ATTEMPTS_WINDOW_KEY] = set
    migrateLegacySessionStorageAttempts()
  }
  return set
}

/** One-time migration from sessionStorage keys (survived F5 and blocked retries). */
function migrateLegacySessionStorageAttempts(): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(CSP_USER_SCRIPT_ATTEMPT_PREFIX)) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    // ignore
  }
}

function cspUserScriptAttemptKey(tabUrl: string, mode: string): string {
  return `${mode}:${tabUrl}`
}

function hasCspUserScriptBeenAttempted(tabUrl: string, mode: string): boolean {
  if (!tabUrl) {
    return false
  }
  return getCspUserScriptAttemptSet().has(cspUserScriptAttemptKey(tabUrl, mode))
}

function markCspUserScriptAttempted(tabUrl: string, mode: string): void {
  if (!tabUrl) {
    return
  }
  getCspUserScriptAttemptSet().add(cspUserScriptAttemptKey(tabUrl, mode))
}

/** Optional launcher metadata (reserved for future bridge extensions). */
export interface CspExtensionExecuteContext {
  gmScope?: string
  scriptKey?: string
  enabledScripts?: Record<string, boolean>
  launcherGlobals?: Record<string, string | boolean | number>
  /** Prefer extension user-script injection before any page eval/nonce path. */
  preferUserScript?: boolean
}

/** Page → content → background user-script execute request (USER_SCRIPT world, CSP-exempt). */
export type CspExtensionExecuteBridgePayload = { requestId: number; mode: 'preset'; decls: string; presetCode: string } | { requestId: number; mode: 'global'; withBody: string }

/** Bridge request body without correlation id (added by {@link requestExtensionUserScriptExecute}). */
export type CspExtensionExecuteBridgeRequest = { mode: 'preset'; decls: string; presetCode: string } | { mode: 'global'; withBody: string }

/**
 * Whether a successful user-script fallback should block later fallback requests on the same page.
 * Preset-core is a document startup path and must not be re-entered; optional global modules are idempotent/lazy.
 * @param mode CSP user-script execute mode
 */
export function shouldRememberCspUserScriptAttempt(mode: CspExtensionExecuteBridgeRequest['mode']): boolean {
  return mode === 'preset'
}

/** Wrap MAIN-world IIFE body and rethrow so userScripts InjectionResult captures failures. */
export function wrapUserScriptIifeBody(innerTryBlock: string): string {
  const catchBlock = escapeInlineScriptText(`catch(e){throw e;}`)
  return `(function(){try{${innerTryBlock}}${catchBlock}})();`
}

let cspBridgeRequestId = 0
const cspBridgePending = new Map<number, { resolve: (result: { cspReload: boolean }) => void; reject: (error: Error) => void }>()
let cspBridgeResponseListenerInstalled = false

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

/** Whether page Trusted Types blocked script/HTML assignment in the page context. */
export function isTrustedTypesAssignmentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return TRUSTED_TYPES_ASSIGNMENT_RE.test(error.message)
}

function assignInlineScriptText(script: HTMLScriptElement, text: string): void {
  try {
    script.textContent = text
  } catch (error) {
    if (isTrustedTypesAssignmentError(error)) {
      throw new CspExtensionFallbackRequired()
    }
    throw error
  }
}

/** Whether the error indicates page eval is blocked and extension scripting fallback should be tried. */
export function isCspExtensionFallbackRequired(error: unknown): boolean {
  return error instanceof CspExtensionFallbackRequired
}

export function isCspUserScriptExhausted(error: unknown): boolean {
  return error instanceof CspUserScriptExhausted
}

/** Serialize page-world CSP bridge requests (remote script + preset-ui share mode=global). */
let cspUserScriptBridgeTail: Promise<void> = Promise.resolve()

type CspUserScriptSandboxStaging = {
  key: string
  sandbox: Record<string, unknown>
}

async function requestExtensionUserScriptExecuteOnce(payload: CspExtensionExecuteBridgeRequest, staging?: CspUserScriptSandboxStaging): Promise<{ cspReload: boolean }> {
  const tabUrl = typeof location !== 'undefined' ? location.href : ''
  const rememberAttempt = shouldRememberCspUserScriptAttempt(payload.mode)
  if (rememberAttempt && hasCspUserScriptBeenAttempted(tabUrl, payload.mode)) {
    throw new CspUserScriptExhausted()
  }

  const previous = cspUserScriptBridgeTail
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  cspUserScriptBridgeTail = current
  await previous

  const host = globalThis as Record<string, unknown>
  if (staging) {
    host[staging.key] = staging.sandbox
  }
  try {
    const result = await requestExtensionUserScriptExecute(payload)
    if (rememberAttempt) {
      markCspUserScriptAttempted(tabUrl, payload.mode)
    }
    return result
  } finally {
    if (staging && host[staging.key] === staging.sandbox) {
      delete host[staging.key]
    }
    release()
  }
}

function handleCspBridgeResponse(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return
  }
  const { id, ok, error, cspReload } = payload as { id?: unknown; ok?: unknown; error?: unknown; cspReload?: unknown }
  if (typeof id !== 'number') {
    return
  }
  const entry = cspBridgePending.get(id)
  if (!entry) {
    return
  }
  cspBridgePending.delete(id)
  if (ok === true) {
    entry.resolve({ cspReload: cspReload === true })
    return
  }
  entry.reject(new Error(typeof error === 'string' && error ? error : 'CSP extension execute failed'))
}

/** Listen for content-bridge responses to {@link requestExtensionUserScriptExecute} (page world only). */
export function installCspExtensionBridgeResponseListener(): void {
  if (cspBridgeResponseListenerInstalled || typeof window === 'undefined') {
    return
  }
  cspBridgeResponseListenerInstalled = true
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') {
      return
    }
    const { source, type, payload } = event.data as { source?: unknown; type?: unknown; payload?: unknown }
    if (source !== EXTENSION_BRIDGE_MESSAGE_SOURCE || type !== CSP_EXTENSION_EXECUTE_RESPONSE_TYPE) {
      return
    }
    handleCspBridgeResponse(payload)
  })
}

/**
 * Ask the extension to execute dynamic code in page MAIN world via userScripts API.
 */
export function requestExtensionUserScriptExecute(payload: CspExtensionExecuteBridgeRequest): Promise<{ cspReload: boolean }> {
  installCspExtensionBridgeResponseListener()
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('CSP user-script execute unavailable'))
      return
    }
    const id = ++cspBridgeRequestId
    cspBridgePending.set(id, { resolve, reject })
    const bridgePayload: CspExtensionExecuteBridgePayload =
      payload.mode === 'preset'
        ? { requestId: id, mode: 'preset', decls: payload.decls, presetCode: payload.presetCode }
        : { requestId: id, mode: 'global', withBody: payload.withBody }
    window.dispatchEvent(new CustomEvent(CSP_EXTENSION_EXECUTE_EVENT, { detail: bridgePayload }))
    setTimeout(() => {
      if (!cspBridgePending.has(id)) {
        return
      }
      cspBridgePending.delete(id)
      reject(new Error('CSP user-script bridge timeout'))
    }, 120000)
  })
}

/** Run {@link executeWithGlobal} or defer to extension user-script API when nonce fallback is unavailable. */
export async function executeWithGlobalResilient(global: Record<string, unknown>, withBody: string, context?: CspExtensionExecuteContext): Promise<CspScriptExecuteMode> {
  if (context?.preferUserScript) {
    try {
      const result = await requestExtensionUserScriptExecuteOnce({ mode: 'global', withBody }, { key: CSP_EXEC_MODULE_GLOBAL_KEY, sandbox: global })
      return result.cspReload ? 'csp-reload' : 'user-script'
    } catch (error) {
      if (isCspUserScriptExhausted(error)) {
        throw error
      }
      // Extension path unavailable/failed: fall back to legacy page execution path.
    }
  }
  try {
    return executeWithGlobal(global, withBody)
  } catch (error) {
    if (!isCspExtensionFallbackRequired(error)) {
      throw error
    }
    const result = await requestExtensionUserScriptExecuteOnce({ mode: 'global', withBody }, { key: CSP_EXEC_MODULE_GLOBAL_KEY, sandbox: global })
    return result.cspReload ? 'csp-reload' : 'user-script'
  }
}

/** Run {@link executePresetWithG} or defer to extension user-script API when nonce fallback is unavailable. */
export async function executePresetWithGResilient(
  g: Record<string, unknown>,
  decls: string,
  presetCode: string,
  context?: CspExtensionExecuteContext
): Promise<CspScriptExecuteMode> {
  if (context?.preferUserScript) {
    try {
      const result = await requestExtensionUserScriptExecuteOnce({ mode: 'preset', decls, presetCode }, { key: CSP_EXEC_PRESET_GLOBAL_KEY, sandbox: g })
      return result.cspReload ? 'csp-reload' : 'user-script'
    } catch (error) {
      if (isCspUserScriptExhausted(error)) {
        throw error
      }
      // Extension path unavailable/failed: fall back to legacy page execution path.
    }
  }
  try {
    return executePresetWithG(g, decls, presetCode)
  } catch (error) {
    if (!isCspExtensionFallbackRequired(error)) {
      throw error
    }
    const result = await requestExtensionUserScriptExecuteOnce({ mode: 'preset', decls, presetCode }, { key: CSP_EXEC_PRESET_GLOBAL_KEY, sandbox: g })
    return result.cspReload ? 'csp-reload' : 'user-script'
  }
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
  const key = JSON.stringify(CSP_EXEC_MODULE_GLOBAL_KEY)
  return `(function(){var global=window[${key}];try{${inner}}finally{delete window[${key}];}})();`
}

/** USER_SCRIPT world: run with(window) without staging globals on window. */
export function buildWithGlobalWindowScriptSource(withBody: string): string {
  const inner = escapeInlineScriptText(`with(global){${withBody}}`)
  return wrapUserScriptIifeBody(`var global=window;${inner}`)
}

/**
 * USER_SCRIPT world: run with staged sandbox on window[{@link CSP_EXEC_MODULE_GLOBAL_KEY}].
 * Page MAIN world must set the key before requesting background execute.
 */
export function buildWithGlobalStagedScriptSource(withBody: string): string {
  const key = JSON.stringify(CSP_EXEC_MODULE_GLOBAL_KEY)
  const inner = escapeInlineScriptText(`with(global){${withBody}}`)
  const staged = escapeInlineScriptText(
    `var global=window[${key}];if(!global){throw new Error('CSP user-script sandbox missing on window');}${inner};try{delete window[${key}]}catch(_){}`
  )
  return wrapUserScriptIifeBody(staged)
}

/**
 * Execute code via a nonce-bearing inline script (no unsafe-eval).
 * @param global Sandbox object used as `with(global)` target
 * @param withBody Body inside the with block
 */
export function runWithGlobalViaNonceScript(global: Record<string, unknown>, withBody: string): void {
  const nonce = getPageScriptNonce()
  if (!nonce) {
    throw new CspExtensionFallbackRequired()
  }
  const root = document.documentElement || document.head || document.body
  if (!root) {
    throw new Error('document not ready for script injection')
  }

  const host = globalThis as Record<string, unknown>
  host[CSP_EXEC_MODULE_GLOBAL_KEY] = global
  const script = document.createElement('script')
  script.nonce = nonce
  assignInlineScriptText(script, buildWithGlobalScriptSource(withBody))
  root.appendChild(script)
  script.remove()
  if (host[CSP_EXEC_MODULE_GLOBAL_KEY] === global) {
    delete host[CSP_EXEC_MODULE_GLOBAL_KEY]
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
  const key = JSON.stringify(CSP_EXEC_PRESET_GLOBAL_KEY)
  return `(function(){var g=window[${key}];try{${inner}}finally{delete window[${key}];}})();`
}

/** USER_SCRIPT world: preset uses window (GM APIs already installed in page MAIN world). */
export function buildPresetWithWindowScriptSource(decls: string, presetCode: string): string {
  const inner = escapeInlineScriptText(`with(g) {\n${decls}\n${presetCode}\n}`)
  return wrapUserScriptIifeBody(`var g=window;${inner}`)
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
      throw new CspExtensionFallbackRequired()
    }
    const root = document.documentElement || document.head || document.body
    if (!root) {
      throw new Error('document not ready for preset script injection')
    }
    const host = globalThis as Record<string, unknown>
    host[CSP_EXEC_PRESET_GLOBAL_KEY] = g
    const script = document.createElement('script')
    script.nonce = nonce
    assignInlineScriptText(script, buildPresetWithGScriptSource(decls, presetCode))
    root.appendChild(script)
    script.remove()
    if (host[CSP_EXEC_PRESET_GLOBAL_KEY] === g) {
      delete host[CSP_EXEC_PRESET_GLOBAL_KEY]
    }
    return 'nonce-script'
  }
}
