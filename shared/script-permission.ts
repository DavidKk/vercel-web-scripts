/** High-sensitivity script capabilities gated at runtime (extension path). */
export type ScriptPermissionCapability = 'network' | 'clipboard-write' | 'open-tab' | 'download' | 'unsafe-window'

export const SCRIPT_PERMISSION_CAPABILITIES: readonly ScriptPermissionCapability[] = ['network', 'clipboard-write', 'open-tab', 'download', 'unsafe-window'] as const

export const PERMISSION_DENIED_CODE = 'PERMISSION_DENIED'

export const DEFAULT_PERMISSION_PROMPT_TIMEOUT_MS = 5 * 60 * 1000

export const PERMISSION_BATCH_DEBOUNCE_MS = 150

export interface ScriptPermissionContext {
  scriptKey: string
  file: string
  contentHash?: string
}

export interface ScriptPermissionRequest extends ScriptPermissionContext {
  capability: ScriptPermissionCapability
  resource: string
}

export type ScriptPermissionDecision = 'allow' | 'deny'

export type ScriptPermissionRemember = 'once' | 'session' | 'persistent'

/** Admin UI policy stored on persistent registry rows. */
export type ScriptPermissionAdminPolicy = 'allow' | 'ask' | 'deny'

/** Per scriptKey default in Servers → Script key scope (shared across services). */
export type ScriptPermissionMode = 'trust' | 'ask'

export const DEFAULT_SCRIPT_PERMISSION_MODE: ScriptPermissionMode = 'ask'

export interface ScriptPermissionRegistryEntry {
  decision: ScriptPermissionDecision
  remember: 'persistent'
  /** When `ask`, the row is tracked in admin but runtime prompts each time. */
  adminPolicy?: ScriptPermissionAdminPolicy
  contentHash?: string
  updatedAt: number
}

export interface ScriptPermissionRegistry {
  version: 1
  entries: Record<string, ScriptPermissionRegistryEntry>
}

export function createEmptyScriptPermissionRegistry(): ScriptPermissionRegistry {
  return { version: 1, entries: {} }
}

export function buildScriptPermissionRegistryKey(scriptKey: string, file: string, capability: ScriptPermissionCapability, resource: string): string {
  const normalizedKey = encodeURIComponent(scriptKey.trim())
  const normalizedFile = encodeURIComponent(file.trim())
  const normalizedResource = resource.trim().toLowerCase()
  return `${normalizedKey}:${normalizedFile}:${capability}:${normalizedResource}`
}

export function parseScriptPermissionRegistryKey(key: string): ScriptPermissionRequest | null {
  const parts = key.split(':')
  if (parts.length < 4) {
    return null
  }
  let scriptKey = ''
  let file = ''
  try {
    scriptKey = decodeURIComponent(parts[0]?.trim() ?? '')
    file = decodeURIComponent(parts[1]?.trim() ?? '')
  } catch {
    return null
  }
  const capability = parts[2]?.trim() as ScriptPermissionCapability
  const resource = parts.slice(3).join(':').trim()
  if (!scriptKey || !file || !resource || !SCRIPT_PERMISSION_CAPABILITIES.includes(capability)) {
    return null
  }
  return { scriptKey, file, capability, resource }
}

/**
 * Normalize a URL or host string into a permission resource key (hostname[:port]).
 * @param input Request URL or hostname
 * @returns Lowercase host key or null when invalid
 */
export function normalizePermissionNetworkHost(input: string): string | null {
  const raw = input.trim()
  if (!raw) {
    return null
  }
  try {
    const url = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`)
    const host = url.hostname.trim().toLowerCase()
    if (!host) {
      return null
    }
    const port = url.port
    if (port && port !== '443' && port !== '80') {
      return `${host}:${port}`
    }
    return host
  } catch {
    return null
  }
}

/**
 * Resolve persistent registry decision for a permission request.
 * @returns allow/deny when registry has a matching persistent entry; undefined when no opinion
 */
export function resolvePersistentPermissionDecision(registry: ScriptPermissionRegistry | null | undefined, request: ScriptPermissionRequest): ScriptPermissionDecision | undefined {
  const entry = registry?.entries?.[buildScriptPermissionRegistryKey(request.scriptKey, request.file, request.capability, request.resource)]
  if (!entry) {
    return undefined
  }
  if (entry.adminPolicy === 'ask') {
    return undefined
  }
  if (entry.adminPolicy === 'allow' || entry.adminPolicy === 'deny') {
    return entry.adminPolicy
  }
  // contentHash on registry entries is audit metadata only.
  // Persistent Always / Deny survives Update runtime and script-list refresh;
  // revoke or edit only via Admin → Permissions.
  return entry.decision
}

/**
 * Whether a permission resource key authorizes a request URL host.
 * @param resource Registry resource (hostname[:port] or `*`)
 * @param url Request URL or hostname
 */
export function permissionResourceMatchesUrl(resource: string, url: string): boolean {
  const normalizedResource = resource.trim().toLowerCase()
  if (normalizedResource === '*') {
    return true
  }
  const host = normalizePermissionNetworkHost(url)
  if (!host) {
    return false
  }
  return host === normalizedResource
}

export function formatPermissionCapabilityLabel(capability: ScriptPermissionCapability): string {
  switch (capability) {
    case 'network':
      return 'Network access'
    case 'clipboard-write':
      return 'Write clipboard'
    case 'open-tab':
      return 'Open new tab'
    case 'download':
      return 'Download file'
    case 'unsafe-window':
      return 'Access page window'
    default:
      return capability
  }
}

/** Tier-1 capabilities pre-authorized under Servers → Full trust (sync page cache + background seed). */
export const TRUST_TIER1_PERMISSION_SEEDS: ReadonlyArray<{ capability: ScriptPermissionCapability; resource: string }> = [
  { capability: 'unsafe-window', resource: '*' },
  { capability: 'clipboard-write', resource: '*' },
  { capability: 'download', resource: '*' },
]
