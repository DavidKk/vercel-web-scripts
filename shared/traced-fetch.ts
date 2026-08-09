/** Client `fetch` that injects / reuses `x-vws-trace-id`. */

import { createTraceId, getActiveTraceId, normalizeTraceId, readTraceIdFromHeaders, TRACE_ID_HEADER } from '@shared/trace-id'

export type TracedFetchInit = RequestInit & {
  /** Explicit TraceId; falls back to active scope then a new hex TraceId. */
  traceId?: string
}

/**
 * Resolve TraceId for an outbound request.
 * @param init Optional fetch init with traceId
 * @returns TraceId to send
 */
function resolveOutboundTraceId(init?: TracedFetchInit): string {
  return normalizeTraceId(init?.traceId) ?? getActiveTraceId() ?? createTraceId()
}

/**
 * `fetch` wrapper that sets `x-vws-trace-id` on the request.
 * @param input Request URL or Request
 * @param init Fetch options (optional `traceId`)
 * @returns Fetch response
 */
export async function tracedFetch(input: RequestInfo | URL, init?: TracedFetchInit): Promise<Response> {
  const traceId = resolveOutboundTraceId(init)
  const headers = new Headers(init?.headers)
  if (!headers.has(TRACE_ID_HEADER)) {
    headers.set(TRACE_ID_HEADER, traceId)
  }
  const { traceId: _traceIdOption, ...rest } = init ?? {}
  void _traceIdOption
  return fetch(input, { ...rest, headers })
}

/**
 * Read TraceId from a response (echoed by MagickMonkey API).
 * @param response Fetch response
 * @returns Normalized TraceId when present
 */
export function readResponseTraceId(response: Response): string | undefined {
  return readTraceIdFromHeaders(response.headers)
}
