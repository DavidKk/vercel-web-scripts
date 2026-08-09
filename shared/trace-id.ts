import { EXTENSION_BRIDGE_MESSAGE_SOURCE, PAGE_TRACE_ID_MESSAGE_TYPE } from './launcher-constants'

/** HTTP / log correlation header for MagickMonkey TraceId. */
export const TRACE_ID_HEADER = 'x-vws-trace-id'

/**
 * Page-world global holding the active TraceId for inject/Launcher + preset correlation.
 * Extension page host sets this; preset / GME loggers read it across separate bundles.
 */
export const PAGE_TRACE_ID_GLOBAL_KEY = '__VWS_PAGE_TRACE_ID__'

/** Canonical TraceId length (lowercase hex, no separators). */
export const TRACE_ID_HEX_LENGTH = 16

/** Short display length in console / Admin Logs Trace column. */
export const TRACE_ID_SHORT_LENGTH = 8

/** Canonical form: continuous hex (easy to copy/paste). */
const TRACE_ID_HEX_RE = /^[0-9a-f]+$/i

/** Legacy UUID v4 (still accepted inbound; normalized to hex without dashes). */
const TRACE_ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Fill a byte array with CSPRNG bytes when available.
 * @param bytes Destination buffer
 */
function fillRandomBytes(bytes: Uint8Array): void {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
    return
  }
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
}

/**
 * Create a new TraceId as continuous lowercase hex (no dashes).
 * @returns 16-character hex string
 */
export function createTraceId(): string {
  const bytes = new Uint8Array(TRACE_ID_HEX_LENGTH / 2)
  fillRandomBytes(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Normalize a raw TraceId candidate.
 * Accepts continuous hex (16–32 chars) or legacy UUID (converted to hex).
 * @param raw Header value, option field, or unknown input
 * @returns Lowercase hex TraceId, or undefined when invalid
 */
export function normalizeTraceId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') {
    return undefined
  }
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }
  if (TRACE_ID_UUID_RE.test(trimmed)) {
    return trimmed.replace(/-/g, '').toLowerCase()
  }
  if (!TRACE_ID_HEX_RE.test(trimmed)) {
    return undefined
  }
  const hex = trimmed.toLowerCase()
  if (hex.length < TRACE_ID_HEX_LENGTH || hex.length > 32 || hex.length % 2 !== 0) {
    return undefined
  }
  return hex
}

/**
 * Read TraceId from request / response headers.
 * @param headers Headers-like map
 * @returns Normalized TraceId when present and valid
 */
export function readTraceIdFromHeaders(headers: Headers | { get(name: string): string | null }): string | undefined {
  return normalizeTraceId(headers.get(TRACE_ID_HEADER))
}

/**
 * Short display form for console prefixes / Admin Logs Trace column.
 * @param traceId Full TraceId
 * @returns Eight-character short code, or empty string when invalid
 */
export function shortTraceId(traceId: string | undefined | null): string {
  const normalized = normalizeTraceId(traceId)
  if (!normalized) {
    return ''
  }
  return normalized.slice(0, TRACE_ID_SHORT_LENGTH)
}

/**
 * Read page-global TraceId (cross-bundle correlation for inject + preset).
 * @returns Normalized TraceId when set on globalThis
 */
export function readPageTraceId(): string | undefined {
  if (typeof globalThis === 'undefined') {
    return undefined
  }
  return normalizeTraceId((globalThis as Record<string, unknown>)[PAGE_TRACE_ID_GLOBAL_KEY])
}

/**
 * Publish TraceId on the page global for other bundles (preset OTA, boot flush).
 * Also notifies the content bridge so Admin Logs can enrich page/Preset lines that omit meta.traceId.
 * @param traceId TraceId to publish
 * @returns Normalized TraceId written to globalThis
 */
export function publishPageTraceId(traceId: string): string {
  const id = normalizeTraceId(traceId) ?? createTraceId()
  if (typeof globalThis !== 'undefined') {
    ;(globalThis as Record<string, unknown>)[PAGE_TRACE_ID_GLOBAL_KEY] = id
  }
  if (typeof window !== 'undefined') {
    try {
      window.postMessage(
        {
          source: EXTENSION_BRIDGE_MESSAGE_SOURCE,
          type: PAGE_TRACE_ID_MESSAGE_TYPE,
          payload: { traceId: id },
        },
        '*'
      )
    } catch {
      // ignore bridge errors
    }
  }
  return id
}

/**
 * Resolve TraceId for logging: active stack, then page global.
 * @returns Active TraceId when available
 */
export function resolveLogTraceId(): string | undefined {
  return getActiveTraceId() ?? readPageTraceId()
}

/**
 * Scan call arguments for an object field `traceId` (e.g. Server Action options).
 * @param args Variadic arguments
 * @returns First valid TraceId found
 */
export function peekTraceIdFromArgs(args: readonly unknown[]): string | undefined {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
      continue
    }
    const normalized = normalizeTraceId((arg as { traceId?: unknown }).traceId)
    if (normalized) {
      return normalized
    }
  }
  return undefined
}

/** Nested active TraceId stack (browser / sync script scopes). */
const activeTraceIdStack: string[] = []

/**
 * Push a TraceId scope (script run, UI action). Returns the active id.
 * @param traceId Optional existing id; creates one when omitted/invalid
 * @returns Active TraceId for this scope
 */
export function enterTraceScope(traceId?: string): string {
  const id = normalizeTraceId(traceId) ?? createTraceId()
  activeTraceIdStack.push(id)
  return id
}

/**
 * Pop the current TraceId scope opened by {@link enterTraceScope}.
 */
export function exitTraceScope(): void {
  if (activeTraceIdStack.length > 0) {
    activeTraceIdStack.pop()
  }
}

/**
 * Current TraceId from the nested browser/script stack.
 * @returns Active TraceId, or undefined outside a scope
 */
export function getActiveTraceId(): string | undefined {
  const depth = activeTraceIdStack.length
  return depth > 0 ? activeTraceIdStack[depth - 1] : undefined
}

/**
 * Run `fn` inside a TraceId scope (always exits, even on throw).
 * @param fn Work to run
 * @param traceId Optional existing TraceId
 * @returns Result of `fn`
 */
export function withTraceScope<T>(fn: () => T, traceId?: string): T {
  enterTraceScope(traceId)
  try {
    return fn()
  } finally {
    exitTraceScope()
  }
}
