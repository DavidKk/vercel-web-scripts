/**
 * Runtime core API object exposed to modules/scripts.
 */
export interface RuntimeCoreApi {
  version: number
  register: (name: string, api: unknown, options?: RuntimeModuleRegisterOptions) => void
  get: <T = unknown>(name: string) => T | undefined
  on: (event: string, handler: RuntimeEventHandler) => () => void
  emit: (event: string, payload?: unknown) => void
  handshake: (moduleName: string, minApiVersion: number) => boolean
}

/**
 * Runtime module registration options.
 */
export interface RuntimeModuleRegisterOptions {
  minApiVersion?: number
}

/**
 * Runtime event callback signature.
 */
export type RuntimeEventHandler = (payload: unknown) => void

const RUNTIME_CORE_KEY = '__VWS_CORE__'
const RUNTIME_CORE_VERSION = 1

/**
 * Get preset global object for runtime attachment.
 * @returns Shared global object
 */
function getRuntimeGlobal(): Record<string, unknown> {
  if (typeof __GLOBAL__ !== 'undefined') return __GLOBAL__ as unknown as Record<string, unknown>
  if (typeof globalThis !== 'undefined') return globalThis as unknown as Record<string, unknown>
  if (typeof window !== 'undefined') return window as unknown as Record<string, unknown>
  return {}
}

/**
 * Ensure runtime core API exists and return it.
 * @returns Runtime core API instance
 */
export function ensureRuntimeCore(): RuntimeCoreApi {
  const g = getRuntimeGlobal()
  const existing = g[RUNTIME_CORE_KEY] as RuntimeCoreApi | undefined
  if (existing && typeof existing === 'object') {
    return existing
  }

  const registry = new Map<string, unknown>()
  const listeners = new Map<string, Set<RuntimeEventHandler>>()

  /**
   * Register module API into runtime registry.
   * @param name Module name
   * @param api Module API object/value
   * @param options Registration options including minimum API version
   * @returns Nothing
   */
  function register(name: string, api: unknown, options?: RuntimeModuleRegisterOptions): void {
    const minApiVersion = options?.minApiVersion ?? 1
    if (minApiVersion > RUNTIME_CORE_VERSION) {
      throw new Error(`[Runtime Core] Module "${name}" requires apiVersion ${minApiVersion}, current is ${RUNTIME_CORE_VERSION}`)
    }
    registry.set(name, api)
    emit(`module:ready:${name}`, { name, minApiVersion })
  }

  /**
   * Get registered module API by name.
   * @param name Module name
   * @returns Registered module API or undefined
   */
  function get<T = unknown>(name: string): T | undefined {
    return registry.get(name) as T | undefined
  }

  /**
   * Subscribe runtime event.
   * @param event Event name
   * @param handler Event handler
   * @returns Unsubscribe function
   */
  function on(event: string, handler: RuntimeEventHandler): () => void {
    const set = listeners.get(event) ?? new Set<RuntimeEventHandler>()
    set.add(handler)
    listeners.set(event, set)
    return () => {
      const current = listeners.get(event)
      if (!current) return
      current.delete(handler)
      if (current.size === 0) {
        listeners.delete(event)
      }
    }
  }

  /**
   * Emit runtime event.
   * @param event Event name
   * @param payload Event payload
   * @returns Nothing
   */
  function emit(event: string, payload?: unknown): void {
    const set = listeners.get(event)
    if (!set || set.size === 0) return
    set.forEach((handler) => {
      try {
        handler(payload)
      } catch {
        /* ignore one handler failure to keep bus healthy */
      }
    })
  }

  /**
   * Verify module compatibility with runtime core version.
   * @param moduleName Module name for diagnostics
   * @param minApiVersion Minimum required runtime API version
   * @returns True when compatible
   */
  function handshake(moduleName: string, minApiVersion: number): boolean {
    if (minApiVersion > RUNTIME_CORE_VERSION) {
      emit('module:handshake:failed', { moduleName, minApiVersion, current: RUNTIME_CORE_VERSION })
      return false
    }
    return true
  }

  const api: RuntimeCoreApi = {
    version: RUNTIME_CORE_VERSION,
    register,
    get,
    on,
    emit,
    handshake,
  }
  g[RUNTIME_CORE_KEY] = api
  return api
}
