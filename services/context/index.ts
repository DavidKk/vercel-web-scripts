import { createTraceId, normalizeTraceId, readTraceIdFromHeaders, TRACE_ID_HEADER } from '@shared/trace-id'
import type { NextRequest } from 'next/server'

export interface Context {
  headers: Headers
  req: NextRequest
  /** Correlation id for this request / action (echoed as x-vws-trace-id). */
  traceId: string
}

const storage = new AsyncLocalStorage<Context>()

/**
 * Run work inside a request-bound ALS context (API routes).
 * @param req Incoming Next.js request
 * @param fn Work to run
 * @returns Result of `fn`
 */
export function runWithContext<T>(req: NextRequest, fn: () => T): T {
  return storage.run(createContext(req), fn)
}

/**
 * Run work with an explicit TraceId (Server Actions without NextRequest).
 * Nested calls replace the active context for the duration of `fn`.
 * @param traceId Correlation id
 * @param fn Work to run
 * @returns Result of `fn`
 */
export function runWithTraceId<T>(traceId: string, fn: () => T): T {
  const id = normalizeTraceId(traceId) ?? createTraceId()
  const existing = storage.getStore()
  if (existing) {
    const headers = new Headers(existing.headers)
    headers.set(TRACE_ID_HEADER, id)
    return storage.run({ ...existing, headers, traceId: id }, fn)
  }
  const headers = new Headers()
  headers.set(TRACE_ID_HEADER, id)
  // Minimal context for Server Actions — `req` is unused; callers must not rely on getReqHeaders().
  return storage.run({ req: undefined as unknown as NextRequest, headers, traceId: id }, fn)
}

/**
 * Build ALS context from an HTTP request (reuse inbound TraceId when valid).
 * @param req Incoming Next.js request
 * @returns Fresh context with response headers pre-seeded
 */
export function createContext(req: NextRequest): Context {
  const headers = new Headers()
  const traceId = readTraceIdFromHeaders(req.headers) ?? createTraceId()
  headers.set(TRACE_ID_HEADER, traceId)
  return { req, headers, traceId }
}

/**
 * Current ALS context, if any.
 * @returns Active context or undefined
 */
export function getContext() {
  return storage.getStore()
}

/**
 * Active TraceId from ALS (API or Server Action).
 * @returns TraceId or undefined outside a context
 */
export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId
}

type TrimFirst<T extends any[]> = T extends [any, ...infer B] ? B : never

export function withContext<T extends (ctx: Context, ...args: any[]) => any>(fn: T) {
  return (...args: TrimFirst<Parameters<T>>): ReturnType<T> | undefined => {
    if (typeof window !== 'undefined') {
      return
    }

    const context = getContext()
    if (!context) {
      return
    }

    return fn(context, ...args)
  }
}

export const getReqHeaders = withContext((ctx) => ctx.req?.headers)

export const getHeaders = withContext((ctx) => ctx.headers)

export const setHeaders = withContext((ctx, headers: Headers | Record<string, string>) => {
  if (headers instanceof Headers) {
    headers = Object.fromEntries(headers.entries())
  }

  for (const [key, value] of Object.entries(headers)) {
    ctx.headers.set(key, value)
  }
})
