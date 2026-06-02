import type { ExtensionServicesState, ScriptKeyMeta, ServiceProfile } from '../types'

/**
 * Normalize MagickMonkey server origin (trim, strip trailing slashes).
 * @param baseUrl Raw server URL from UI or Connect
 * @returns Normalized origin string
 */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * Normalize script key (trim whitespace).
 * @param scriptKey Raw script key
 * @returns Trimmed script key
 */
export function normalizeScriptKey(scriptKey: string): string {
  return scriptKey.trim()
}

/**
 * Stable endpoint identity for dedupe and OTA cache scope.
 * @param baseUrl Server URL
 * @param scriptKey Script key
 * @returns `${baseUrl}|${scriptKey}` with normalized parts
 */
export function serviceEndpointKey(baseUrl: string, scriptKey: string): string {
  return `${normalizeBaseUrl(baseUrl)}|${normalizeScriptKey(scriptKey)}`
}

/**
 * Whether two services point at the same endpoint.
 * @param a First service
 * @param b Second service
 * @returns True when baseUrl and scriptKey match after normalization
 */
export function isSameServiceEndpoint(a: ServiceProfile, b: ServiceProfile): boolean {
  return serviceEndpointKey(a.baseUrl, a.scriptKey) === serviceEndpointKey(b.baseUrl, b.scriptKey)
}

/**
 * Find a service by endpoint in a list.
 * @param services Service list
 * @param baseUrl Server URL
 * @param scriptKey Script key
 * @returns Matching service or undefined
 */
export function findServiceByEndpoint(services: ServiceProfile[], baseUrl: string, scriptKey: string): ServiceProfile | undefined {
  const key = serviceEndpointKey(baseUrl, scriptKey)
  return services.find((s) => serviceEndpointKey(s.baseUrl, s.scriptKey) === key)
}

/**
 * Count how many services reference a scriptKey.
 * @param scriptKey Script key to count
 * @param services Service list
 * @returns Number of services with that scriptKey
 */
export function countServiceRefs(scriptKey: string, services: ServiceProfile[]): number {
  const normalized = normalizeScriptKey(scriptKey)
  return services.filter((s) => normalizeScriptKey(s.scriptKey) === normalized).length
}

/**
 * Unique enabled scriptKeys in list order (first occurrence wins).
 * @param services Service list
 * @returns Ordered unique scriptKeys from enabled services
 */
export function getEnabledScriptKeys(services: ServiceProfile[]): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const service of services) {
    if (!service.enabled) {
      continue
    }
    const key = normalizeScriptKey(service.scriptKey)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    keys.push(key)
  }
  return keys
}

/**
 * Resolve OTA endpoint for a scriptKey (first enabled service in list order).
 * @param scriptKey Target script key
 * @param services Service list
 * @returns First enabled matching service or null
 */
export function resolveOtaEndpoint(scriptKey: string, services: ServiceProfile[]): ServiceProfile | null {
  const normalized = normalizeScriptKey(scriptKey)
  for (const service of services) {
    if (service.enabled && normalizeScriptKey(service.scriptKey) === normalized) {
      return service
    }
  }
  return null
}

/**
 * Resolve develop service (first enabled + developMode in list order).
 * @param services Service list
 * @returns First develop service or null when none qualify
 */
export function resolveDevelopService(services: ServiceProfile[]): ServiceProfile | null {
  for (const service of services) {
    if (service.enabled && service.developMode) {
      return service
    }
  }
  return null
}

/**
 * Derive a default service label from server URL host.
 * @param baseUrl Server URL
 * @returns Hostname or fallback label
 */
export function defaultLabelFromBaseUrl(baseUrl: string): string {
  try {
    const host = new URL(normalizeBaseUrl(baseUrl)).hostname
    return host || 'Service'
  } catch {
    return 'Service'
  }
}

/**
 * Derive default gmScope from a label (alphanumeric + underscore).
 * @param label Service or group label
 * @returns Sanitized gmScope candidate
 */
export function defaultGmScopeFromLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) {
    return 'svc'
  }
  const sanitized = trimmed.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')
  return sanitized || 'svc'
}

/**
 * Ensure gmScope is unique within existing meta entries.
 * @param gmScope Desired scope
 * @param scriptKey Script key owning this scope
 * @param meta Existing scriptKey meta list
 * @returns Unique gmScope string
 */
export function ensureUniqueGmScope(gmScope: string, scriptKey: string, meta: ScriptKeyMeta[]): string {
  const normalizedScriptKey = normalizeScriptKey(scriptKey)
  const base = defaultGmScopeFromLabel(gmScope)
  const taken = new Set(meta.filter((m) => normalizeScriptKey(m.scriptKey) !== normalizedScriptKey).map((m) => m.gmScope))
  if (!taken.has(base)) {
    return base
  }
  let index = 2
  while (taken.has(`${base}_${index}`)) {
    index += 1
  }
  return `${base}_${index}`
}

/**
 * Get gmScope for a scriptKey, falling back to label-derived default.
 * @param scriptKey Script key
 * @param meta Script key meta list
 * @param fallbackLabel Label used when meta is missing
 * @returns gmScope string
 */
export function getGmScopeForScriptKey(scriptKey: string, meta: ScriptKeyMeta[], fallbackLabel: string): string {
  const normalized = normalizeScriptKey(scriptKey)
  const found = meta.find((m) => normalizeScriptKey(m.scriptKey) === normalized)
  if (found?.gmScope) {
    return found.gmScope
  }
  return ensureUniqueGmScope(defaultGmScopeFromLabel(fallbackLabel), scriptKey, meta)
}

/**
 * Upsert scriptKey meta entry with a gmScope.
 * @param state Services state (mutated in place)
 * @param scriptKey Script key
 * @param label Label for default gmScope when missing
 */
export function ensureScriptKeyMetaEntry(state: ExtensionServicesState, scriptKey: string, label: string): void {
  const normalized = normalizeScriptKey(scriptKey)
  if (!normalized) {
    return
  }
  const existing = state.scriptKeyMeta.find((m) => normalizeScriptKey(m.scriptKey) === normalized)
  if (existing) {
    return
  }
  state.scriptKeyMeta.push({
    scriptKey: normalized,
    gmScope: ensureUniqueGmScope(defaultGmScopeFromLabel(label), normalized, state.scriptKeyMeta),
  })
}

/**
 * Whether scriptKey looks like SHA-256 hex (64 chars).
 * @param scriptKey Script key to validate
 * @returns True when format matches Tampermonkey script key
 */
export function isValidScriptKeyFormat(scriptKey: string): boolean {
  return /^[a-f0-9]{64}$/i.test(normalizeScriptKey(scriptKey))
}

/**
 * Create a new service id.
 * @returns Unique service id string
 */
export function createServiceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `svc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Normalize persisted services state shape.
 * @param raw Raw storage value
 * @returns Normalized state
 */
export function normalizeExtensionServicesState(raw: unknown): ExtensionServicesState {
  if (!raw || typeof raw !== 'object') {
    return { services: [], scriptKeyMeta: [] }
  }
  const value = raw as ExtensionServicesState
  const services = Array.isArray(value.services) ? value.services.filter(isValidServiceProfile) : []
  const scriptKeyMeta = Array.isArray(value.scriptKeyMeta) ? value.scriptKeyMeta.filter(isValidScriptKeyMeta) : []
  const activeServiceId = typeof value.activeServiceId === 'string' && services.some((s) => s.id === value.activeServiceId) ? value.activeServiceId : undefined
  return { services, scriptKeyMeta, activeServiceId }
}

function isValidServiceProfile(value: unknown): value is ServiceProfile {
  if (!value || typeof value !== 'object') {
    return false
  }
  const s = value as ServiceProfile
  return (
    typeof s.id === 'string' &&
    typeof s.label === 'string' &&
    typeof s.baseUrl === 'string' &&
    typeof s.scriptKey === 'string' &&
    typeof s.enabled === 'boolean' &&
    typeof s.createdAt === 'number' &&
    typeof s.updatedAt === 'number'
  )
}

function isValidScriptKeyMeta(value: unknown): value is ScriptKeyMeta {
  if (!value || typeof value !== 'object') {
    return false
  }
  const m = value as ScriptKeyMeta
  return typeof m.scriptKey === 'string' && typeof m.gmScope === 'string'
}
