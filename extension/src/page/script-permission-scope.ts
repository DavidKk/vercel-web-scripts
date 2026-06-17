import { permissionLogger } from '@ext/shared/logger'
import {
  formatPermissionCapabilityLabel,
  PERMISSION_DENIED_CODE,
  type ScriptPermissionCapability,
  type ScriptPermissionContext,
  type ScriptPermissionRequest,
} from '@shared/script-permission'
import {
  enterScriptPermissionScope,
  exitScriptPermissionScope,
  isScriptPermissionEnforced,
  readPermissionHosts,
  readScriptPermissionStack,
  SCRIPT_CONTENT_HASH_MAP_KEY,
} from '@shared/script-permission-scope'

import { sendPageBridgeRequest } from './page-bridge-client'
import { isPagePermissionAllowed, rememberPagePermissionAllow } from './page-permission-allow-cache'

function parseStaticKeyFromScriptUrl(scriptUrl: string): string | null {
  const remote = scriptUrl.match(/\/static\/([^/]+)\/(?:[a-f0-9]{40}\/)?tampermonkey-remote\.js(?:$|[?#])/i)
  if (remote?.[1]) {
    return remote[1]
  }
  const launcher = scriptUrl.match(/\/static\/([^/]+)\/tampermonkey\.user\.js(?:$|[?#])/i)
  return launcher?.[1] ?? null
}

function readScriptUrlFromGlobal(): string {
  for (const host of readPermissionHosts()) {
    const value = host.__SCRIPT_URL__
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function readScriptKeyFromGlobal(): string {
  for (const host of readPermissionHosts()) {
    const value = host.__VWS_SCRIPT_KEY__
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  const fromUrl = parseStaticKeyFromScriptUrl(readScriptUrlFromGlobal())
  return fromUrl?.trim() ?? ''
}

function readContentHashByFile(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const host of readPermissionHosts()) {
    const map = host[SCRIPT_CONTENT_HASH_MAP_KEY]
    if (!map || typeof map !== 'object') {
      continue
    }
    for (const [file, hash] of Object.entries(map as Record<string, unknown>)) {
      if (typeof hash === 'string' && hash.trim()) {
        out[file] = hash.trim()
      }
    }
  }
  return out
}

export function getActiveScriptPermissionContext(): ScriptPermissionContext | null {
  const scriptKey = readScriptKeyFromGlobal()
  const stack = readScriptPermissionStack()
  const frame = stack[stack.length - 1]
  if (!scriptKey || !frame?.file) {
    return null
  }
  const hashByFile = readContentHashByFile()
  return {
    scriptKey,
    file: frame.file,
    contentHash: frame.contentHash ?? hashByFile[frame.file],
  }
}

function buildRequest(capability: ScriptPermissionCapability, resource: string, context?: ScriptPermissionContext | null): ScriptPermissionRequest | null {
  const callerProvidedContext = context !== undefined
  const ctx = callerProvidedContext ? context : getActiveScriptPermissionContext()
  if (!ctx) {
    return null
  }
  return {
    ...ctx,
    capability,
    resource,
  }
}

export class ScriptPermissionDeniedError extends Error {
  readonly code = PERMISSION_DENIED_CODE

  constructor(message: string) {
    super(message)
    this.name = 'ScriptPermissionDeniedError'
  }
}

/**
 * Gate a high-sensitivity operation; prompts when no persistent/session allow exists.
 * When `context` is passed explicitly, enforcement continues even if the permission scope
 * stack was exited before this async call runs (e.g. unsafeWindow proxy + script `finally`).
 * @param capability Permission capability id
 * @param resource Resource key (hostname, *, etc.)
 * @param context Permission context captured at the API call site (required when scope may exit before async gate runs)
 */
export async function ensureScriptPermission(capability: ScriptPermissionCapability, resource: string, context?: ScriptPermissionContext | null): Promise<void> {
  const callerProvidedContext = context !== undefined
  if (!callerProvidedContext && !isScriptPermissionEnforced()) {
    return
  }
  const request = buildRequest(capability, resource, context)
  await ensureScriptPermissionRequest(request, capability, resource)
}

/**
 * Prompt using a fully-built request (captured synchronously inside permission scope).
 * @param request Permission request payload
 * @param capability Label fallback when request is missing
 * @param resource Label fallback when request is missing
 */
export async function ensureScriptPermissionRequest(request: ScriptPermissionRequest | null, capability?: ScriptPermissionCapability, resource?: string): Promise<void> {
  if (!request) {
    throw new ScriptPermissionDeniedError('No active script permission context')
  }
  if (isPagePermissionAllowed(request)) {
    permissionLogger.debug('ensure:page-cached-allow', {
      file: request.file,
      capability: request.capability,
      resource: request.resource,
      scriptKey: request.scriptKey,
    })
    return
  }
  permissionLogger.info('ensure:request', {
    file: request.file,
    capability: request.capability,
    resource: request.resource,
    scriptKey: request.scriptKey,
  })
  const allowed = await sendPageBridgeRequest<boolean>('permission', [request], 5 * 60 * 1000)
  if (allowed) {
    rememberPagePermissionAllow(request)
  }
  if (!allowed) {
    const labelCapability = capability ?? request.capability
    const labelResource = resource ?? request.resource
    throw new ScriptPermissionDeniedError(`${formatPermissionCapabilityLabel(labelCapability)} denied for ${request.file} (${labelResource})`)
  }
}

/**
 * Pre-authorize @connect hosts for the current tab session (no prompt).
 * @param connects Hosts from script metadata `@connect`
 */
export function seedScriptConnectPermissions(connects: readonly string[]): void {
  if (!isScriptPermissionEnforced() || connects.length === 0) {
    return
  }
  const context = getActiveScriptPermissionContext()
  if (!context) {
    return
  }
  void sendPageBridgeRequest<void>('seedConnects', [context, [...connects]], 30_000).catch(() => undefined)
}

export { enterScriptPermissionScope, exitScriptPermissionScope, isScriptPermissionEnforced }
