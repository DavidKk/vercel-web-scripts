import type { ServerResponse } from 'node:http'
import http from 'node:http'

const DEFAULT_PORT = 5174
let broadcastReload: (() => void) | undefined
let reloadDebounce: ReturnType<typeof setTimeout> | undefined

function getPort(): number {
  const raw = process.env.EXTENSION_DEV_RELOAD_PORT
  if (!raw) {
    return DEFAULT_PORT
  }
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT
}

/**
 * SSE hub for extension watch builds. Background connects and calls chrome.runtime.reload().
 */
export function ensureDevReloadSseServer(): { port: number; sseUrl: string; scheduleBroadcast: () => void } {
  const port = getPort()
  const sseUrl = `http://127.0.0.1:${port}/extension-reload`

  if (!broadcastReload) {
    const clients = new Set<ServerResponse>()

    const server = http.createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Cache-Control',
        })
        res.end()
        return
      }

      if (req.url !== '/extension-reload') {
        res.writeHead(404)
        res.end()
        return
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })
      res.write(': connected\n\n')
      clients.add(res)
      req.on('close', () => {
        clients.delete(res)
      })
    })

    server.listen(port, '127.0.0.1', () => {
      // eslint-disable-next-line no-console
      console.log(`[extension] dev reload SSE → ${sseUrl}`)
    })

    broadcastReload = () => {
      const payload = `event: reload\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`
      for (const client of clients) {
        client.write(payload)
      }
    }
  }

  const scheduleBroadcast = (): void => {
    clearTimeout(reloadDebounce)
    reloadDebounce = setTimeout(() => {
      broadcastReload?.()
    }, 200)
  }

  return { port, sseUrl, scheduleBroadcast }
}
