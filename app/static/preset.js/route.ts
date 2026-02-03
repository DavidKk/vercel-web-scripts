import { NextResponse } from 'next/server'

import { getPresetBundle, getPresetManifest } from '@/services/tampermonkey/gmCore'

/** Normalize ETag from If-None-Match (strip W/ and quotes). */
function normalizeEtag(etag: string | null): string | null {
  if (!etag || typeof etag !== 'string') return null
  const s = etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return s || null
}

/**
 * GET /static/preset.js
 * Serves the preset bundle for launcher dynamic loading.
 * If-None-Match with current content hash → 304 Not Modified (no body).
 * Otherwise returns 200 with ETag (content hash) and body.
 */
export async function GET(req: Request) {
  const ifNoneMatch = req.headers.get('If-None-Match')
  try {
    const manifest = await getPresetManifest()
    if (manifest && ifNoneMatch != null) {
      const clientEtag = normalizeEtag(ifNoneMatch)
      if (clientEtag != null && clientEtag === manifest.hash) {
        return new NextResponse(null, { status: 304 })
      }
    }
    const content = await getPresetBundle()
    const headers: HeadersInit = {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    }
    if (manifest) headers['ETag'] = `"${manifest.hash}"`
    return new NextResponse(content, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const isMissing = (e as NodeJS.ErrnoException)?.code === 'ENOENT'
    // eslint-disable-next-line no-console -- route errors must be visible in terminal
    console.error('[preset.js] GET failed:', e)
    const body = isMissing ? `console.warn("[preset.js] File not built yet. Run: pnpm run build:preset");` : `console.error("[preset.js] ${message}");`
    return new NextResponse(body, {
      status: isMissing ? 503 : 500,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    })
  }
}
