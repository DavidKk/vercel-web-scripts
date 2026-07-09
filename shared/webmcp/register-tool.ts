import { VWS_WEBMCP_PROVIDER_ID, VWS_WEBMCP_TITLE_PREFIX } from './constants'
import { getDocumentModelContext, isWebMcpSupported } from './model-context'
import { buildVwsWebMcpCanonicalName, isValidVwsWebMcpLocalName } from './naming'
import { getOrCreateVwsWebMcpToolRegistry, readWebMcpGlobalHosts } from './registry'
import { resolveWebMcpScriptFile, resolveWebMcpScriptKey } from './runtime-context'
import type { RegisterVwsWebMcpToolResult, VwsWebMcpToolInput, VwsWebMcpToolRecord, WebMcpToolDefinition } from './types'

const WARNED_UNSUPPORTED_KEY = '__VWS_WEBMCP_UNSUPPORTED_WARNED__'

export interface RegisterVwsWebMcpToolOptions {
  signal?: AbortSignal
  /** Logger hook (preset passes GME_warn). */
  warn?: (message: string) => void
  /** Test override for script key resolution. */
  scriptKey?: string
  /** Test override for script file metadata. */
  scriptFile?: string
}

function warnOnce(root: Record<string, unknown>, warn: ((message: string) => void) | undefined, message: string): void {
  if (!warn) {
    return
  }
  if (root[WARNED_UNSUPPORTED_KEY]) {
    return
  }
  root[WARNED_UNSUPPORTED_KEY] = true
  warn(message)
}

function buildFailure(reason: NonNullable<RegisterVwsWebMcpToolResult['reason']>, message: string, warn?: (message: string) => void): RegisterVwsWebMcpToolResult {
  warn?.(message)
  return { ok: false, reason, message }
}

/**
 * Register a MagickMonkey WebMCP tool with `vws.{scriptKey}.{localName}` identity.
 * @param definition Tool input from Gist script
 * @param options Abort signal and optional warn hook
 * @returns Structured registration result (never throws for expected failures)
 */
export async function registerVwsWebMcpTool(definition: VwsWebMcpToolInput, options?: RegisterVwsWebMcpToolOptions): Promise<RegisterVwsWebMcpToolResult> {
  const warn = options?.warn
  const localName = definition.name

  if (!isValidVwsWebMcpLocalName(localName)) {
    return buildFailure('invalid_local_name', `[WebMCP] invalid tool name "${localName}"; use snake_case [a-z][a-z0-9_]{0,63} without dots or vws prefix`, warn)
  }

  const scriptKey = options?.scriptKey?.trim() || resolveWebMcpScriptKey()
  if (!scriptKey) {
    return buildFailure('missing_script_key', '[WebMCP] missing scriptKey; skip tool registration', warn)
  }

  const canonicalName = buildVwsWebMcpCanonicalName(scriptKey, localName)
  const registry = getOrCreateVwsWebMcpToolRegistry()
  if (registry.has(canonicalName)) {
    return buildFailure('duplicate', `[WebMCP] duplicate tool: ${canonicalName}`, warn)
  }

  if (!isWebMcpSupported()) {
    const root = readWebMcpGlobalHosts()[0] ?? (globalThis as unknown as Record<string, unknown>)
    warnOnce(root, warn, '[WebMCP] document.modelContext.registerTool is unavailable; enable chrome://flags/#enable-webmcp-testing')
    return { ok: false, reason: 'unsupported', message: 'WebMCP API unavailable' }
  }

  const modelContext = getDocumentModelContext()
  if (!modelContext) {
    return { ok: false, reason: 'unsupported', message: 'WebMCP API unavailable' }
  }

  const scriptFile = options?.scriptFile?.trim() || resolveWebMcpScriptFile()
  const readOnlyHint = definition.annotations?.readOnlyHint === true
  const record: VwsWebMcpToolRecord = {
    providerId: VWS_WEBMCP_PROVIDER_ID,
    canonicalName,
    localName,
    scriptKey,
    scriptFile,
    description: definition.description,
    readOnlyHint,
    registeredAt: Date.now(),
  }

  const webTool: WebMcpToolDefinition = {
    name: canonicalName,
    title: definition.title ?? `${VWS_WEBMCP_TITLE_PREFIX} · ${localName}`,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: definition.annotations,
    execute: async (input: Record<string, unknown>) => {
      try {
        return await definition.execute(input)
      } catch (error) {
        return {
          ok: false,
          error: 'tool_execute_failed',
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }

  const signal = options?.signal
  if (signal?.aborted) {
    return buildFailure('register_failed', '[WebMCP] registration aborted before registerTool', warn)
  }

  const removeFromRegistry = () => {
    registry.delete(canonicalName)
  }

  if (signal) {
    signal.addEventListener('abort', removeFromRegistry, { once: true })
  }

  try {
    registry.set(canonicalName, record)
    await modelContext.registerTool(webTool, signal ? { signal } : undefined)
    return { ok: true, canonicalName }
  } catch (error) {
    removeFromRegistry()
    const message = error instanceof Error ? error.message : String(error)
    return buildFailure('register_failed', `[WebMCP] registerTool failed: ${message}`, warn)
  }
}
