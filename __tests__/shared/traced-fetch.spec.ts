import { createTraceId, TRACE_ID_HEADER } from '@shared/trace-id'
import { tracedFetch } from '@shared/traced-fetch'

describe('tracedFetch', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should set x-vws-trace-id when missing', async () => {
    let captured: RequestInit | undefined
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init
      return new Response('ok', { status: 200 })
    }) as typeof fetch

    const traceId = createTraceId()
    await tracedFetch('/api/v1/scripts', { method: 'GET', traceId })
    const headers = new Headers(captured?.headers)
    expect(headers.get(TRACE_ID_HEADER)).toBe(traceId)
  })

  it('should not overwrite an existing trace header', async () => {
    let captured: RequestInit | undefined
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init
      return new Response('ok', { status: 200 })
    }) as typeof fetch

    const existing = createTraceId()
    await tracedFetch('/api/v1/scripts', {
      headers: { [TRACE_ID_HEADER]: existing },
      traceId: createTraceId(),
    })
    const headers = new Headers(captured?.headers)
    expect(headers.get(TRACE_ID_HEADER)).toBe(existing)
  })
})
