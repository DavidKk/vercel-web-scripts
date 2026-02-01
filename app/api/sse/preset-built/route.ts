import { NextResponse } from 'next/server'

/**
 * Dev-only SSE endpoint for preset rebuild push.
 * - GET with Accept: text/event-stream → SSE stream (preset subscribes, receives preset-built events).
 * - POST with { builtAt? } → record build time and broadcast to all SSE clients.
 * Only enabled when NODE_ENV === 'development' (local dev server). Production returns 404.
 */
const isDev = process.env.NODE_ENV === 'development'

type SSEClientRef = { controller: ReadableStreamDefaultController<Uint8Array> | null }

/** SSE clients to broadcast preset-built events; use globalThis so HMR re-eval doesn't clear them */
const sseClients: Set<SSEClientRef> =
  (typeof globalThis !== 'undefined' && (globalThis as any).__presetBuiltSSEClients) || ((globalThis as any).__presetBuiltSSEClients = new Set<SSEClientRef>())

const encoder = new TextEncoder()

/** Debounce: don't broadcast too fast when Vite fires closeBundle multiple times in watch mode */
const DEBOUNCE_MS = 500
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pendingBuiltAt: number | null = null

/** Last broadcasted builtAt; exposed for polling (GM_xmlhttpRequest cannot stream SSE) */
let lastBroadcastedBuiltAt: number | null = null

function broadcastPresetBuilt(builtAt: number): void {
  lastBroadcastedBuiltAt = builtAt
  const n = sseClients.size
  // eslint-disable-next-line no-console -- dev SSE push debug
  console.log(`[preset-built] broadcast preset-built builtAt=${builtAt} to ${n} client(s)`)
  const payload = `event: preset-built\ndata: ${JSON.stringify({ builtAt })}\n\n`
  const data = encoder.encode(payload)
  sseClients.forEach((ref) => {
    try {
      if (ref.controller) ref.controller.enqueue(data)
    } catch {
      sseClients.delete(ref)
    }
  })
}

function scheduleBroadcast(builtAt: number): void {
  pendingBuiltAt = builtAt
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const toSend = pendingBuiltAt
    pendingBuiltAt = null
    if (toSend !== null) broadcastPresetBuilt(toSend)
  }, DEBOUNCE_MS)
}

/**
 * GET /api/sse/preset-built (dev only)
 * - Accept: text/event-stream → SSE stream (same-origin only; EventSource works).
 * - Accept: application/json → { lastBuiltAt } for polling (GM_xmlhttpRequest cannot stream SSE).
 * Otherwise → 404. In production this route returns 404.
 */
export async function GET(req: Request) {
  if (!isDev) return new NextResponse(null, { status: 404 })
  const accept = req.headers.get('accept') || ''

  if (accept.includes('application/json')) {
    return NextResponse.json({
      lastBuiltAt: lastBroadcastedBuiltAt ?? 0,
    })
  }

  if (!accept.includes('text/event-stream')) {
    return new NextResponse(null, { status: 404 })
  }

  const ref: SSEClientRef = { controller: null }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      ref.controller = controller
      sseClients.add(ref)
      // eslint-disable-next-line no-console -- dev SSE push debug
      console.log(`[preset-built] SSE client connected, total=${sseClients.size}`)
      controller.enqueue(encoder.encode(': connected\n\n'))
    },
    cancel() {
      ref.controller = null
      sseClients.delete(ref)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Connection: 'keep-alive',
    },
  })
}

/**
 * POST /api/sse/preset-built (dev only)
 * Called by Vite preset build (closeBundle hook) when preset.js is rebuilt. Body: { builtAt?: number }.
 * Broadcasts to all SSE clients so preset can push update to Launcher. Production returns 404.
 */
export async function POST(req: Request) {
  if (!isDev) return new NextResponse(null, { status: 404 })
  try {
    const body = await req.json()
    const builtAt = typeof body?.builtAt === 'number' ? body.builtAt : Date.now()
    // eslint-disable-next-line no-console -- dev SSE push debug
    console.log(`[preset-built] POST received builtAt=${builtAt} clients=${sseClients.size} (debounce ${DEBOUNCE_MS}ms)`)
    scheduleBroadcast(builtAt)
    return NextResponse.json({ ok: true, builtAt })
  } catch {
    return new NextResponse(null, { status: 400 })
  }
}
