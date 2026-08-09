import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { getHeaders, getTraceId, runWithContext } from '@/services/context'

import { isStandardResponse, standardResponseError, stringifyUnknownError } from './response'

export interface Context {
  params: Promise<any>
  searchParams: URLSearchParams
}

export interface ContextWithParams<P> extends Context {
  params: Promise<P>
}

/**
 * Merge ALS response headers with handler-provided headers into a plain record.
 * @param inputHeaders Optional headers from the handler result
 * @returns Plain header map suitable for NextResponse
 */
function buildResponseHeaders(inputHeaders?: HeadersInit): Record<string, string> {
  const merged = new Headers()
  const collected = getHeaders()
  if (collected) {
    collected.forEach((value, key) => {
      merged.set(key, value)
    })
  }
  if (inputHeaders) {
    new Headers(inputHeaders).forEach((value, key) => {
      merged.set(key, value)
    })
  }
  return Object.fromEntries(merged.entries())
}

/**
 * Emit one structured access / error log line for an API handler.
 * @param req Incoming request
 * @param status HTTP status
 * @param error Optional error message
 */
function logApiAccess(req: NextRequest, status: number, error?: string): void {
  const payload: Record<string, unknown> = {
    type: 'vws_api',
    traceId: getTraceId(),
    method: req.method,
    path: req.nextUrl.pathname,
    status,
  }
  if (error) {
    payload.error = error
  }
  // eslint-disable-next-line no-console -- structured API access log
  console.info(JSON.stringify(payload))
}

export function api<P>(handle: (req: NextRequest, context: ContextWithParams<P>) => Promise<Record<string, any>>) {
  return async (req: NextRequest, context: { params: Promise<any> }) => {
    return runWithContext(req, async () => {
      try {
        const enhancedContext: ContextWithParams<P> = {
          params: context.params,
          searchParams: req.nextUrl.searchParams,
        }
        const result = await handle(req, enhancedContext)
        if (result instanceof NextResponse) {
          const headers = buildResponseHeaders()
          for (const [key, value] of Object.entries(headers)) {
            if (!result.headers.has(key)) {
              result.headers.set(key, value)
            }
          }
          logApiAccess(req, result.status)
          return result
        }

        const status = 'status' in result ? result.status : 200
        const inputHeaders = 'headers' in result ? result.headers : undefined
        const headers = buildResponseHeaders(inputHeaders as HeadersInit | undefined)
        logApiAccess(req, typeof status === 'number' ? status : 200)
        return NextResponse.json(result, { status, headers })
      } catch (error) {
        if (error instanceof NextResponse) {
          const headers = buildResponseHeaders()
          for (const [key, value] of Object.entries(headers)) {
            if (!error.headers.has(key)) {
              error.headers.set(key, value)
            }
          }
          logApiAccess(req, error.status)
          return error
        }

        const result = (() => {
          if (isStandardResponse(error)) {
            return error
          }

          const message = stringifyUnknownError(error)
          return standardResponseError(message)
        })()

        const message = stringifyUnknownError(error)
        logApiAccess(req, 500, message)
        return NextResponse.json(result, { status: 500, headers: buildResponseHeaders() })
      }
    })
  }
}

export function plainText<P>(handle: (req: NextRequest, context: ContextWithParams<P>) => Promise<string | NextResponse>) {
  return async (req: NextRequest, context: { params: Promise<any> }) => {
    return runWithContext(req, async () => {
      try {
        const enhancedContext: ContextWithParams<P> = {
          params: context.params,
          searchParams: req.nextUrl.searchParams,
        }
        const result = await handle(req, enhancedContext)
        if (result instanceof NextResponse) {
          const headers = buildResponseHeaders()
          for (const [key, value] of Object.entries(headers)) {
            if (!result.headers.has(key)) {
              result.headers.set(key, value)
            }
          }
          logApiAccess(req, result.status)
          return result
        }

        const headers = buildResponseHeaders()
        logApiAccess(req, 200)
        return new NextResponse(result, { status: 200, headers })
      } catch (error) {
        const message = stringifyUnknownError(error)
        logApiAccess(req, 500, message)
        return new NextResponse(message, { status: 500, headers: buildResponseHeaders() })
      }
    })
  }
}

export function buffer<P>(handle: (req: NextRequest, context: ContextWithParams<P>) => Promise<ArrayBuffer | NextResponse>) {
  return async (req: NextRequest, context: { params: Promise<any> }) => {
    return runWithContext(req, async () => {
      try {
        const enhancedContext: ContextWithParams<P> = {
          params: context.params,
          searchParams: req.nextUrl.searchParams,
        }
        const result = await handle(req, enhancedContext)
        if (result instanceof NextResponse) {
          const headers = buildResponseHeaders()
          for (const [key, value] of Object.entries(headers)) {
            if (!result.headers.has(key)) {
              result.headers.set(key, value)
            }
          }
          logApiAccess(req, result.status)
          return result
        }
        const headers = buildResponseHeaders()
        logApiAccess(req, 200)
        return new NextResponse(result, { status: 200, headers })
      } catch (error) {
        const message = stringifyUnknownError(error)
        logApiAccess(req, 500, message)
        return new NextResponse(message, { status: 500, headers: buildResponseHeaders() })
      }
    })
  }
}
