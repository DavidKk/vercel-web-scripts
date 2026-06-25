import { NextResponse } from 'next/server'

import { CONTENT_ADDRESSED_CACHE_CONTROL, isSha1ContentHash } from '@/services/runtime/contentAddressedAssets'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { buildRemoteScriptBundleFromGist } from '@/services/tampermonkey/remoteScriptBundle.server'

interface Params {
  key: string
  hash: string
}

/**
 * Normalize ETag from If-None-Match.
 * @param etag Raw header value
 * @returns Normalized value or null
 */
function normalizeEtag(etag: string | null): string | null {
  if (!etag || typeof etag !== 'string') return null
  const value = etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return value || null
}

/**
 * GET /static/[key]/[hash]/tampermonkey-remote.alpha.js
 * Content-addressed alpha-track GIST-compiled bundle.
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  const ifNoneMatch = normalizeEtag(req.headers.get('If-None-Match'))

  if (params.key !== getTampermonkeyScriptKey()) {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (!isSha1ContentHash(params.hash)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const bundle = await buildRemoteScriptBundleFromGist('alpha')
    if (!bundle || params.hash !== bundle.hash) {
      return new NextResponse(`console.warn("[tampermonkey-remote.alpha.js] Stale path hash; refetch module manifest from the server.");`, {
        status: 404,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (ifNoneMatch && ifNoneMatch === bundle.hash) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: `"${bundle.hash}"`,
          'Cache-Control': CONTENT_ADDRESSED_CACHE_CONTROL,
        },
      })
    }

    return new NextResponse(bundle.content, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': CONTENT_ADDRESSED_CACHE_CONTROL,
        ETag: `"${bundle.hash}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error('[tampermonkey-remote.alpha.js@key/hash] GET failed:', err)
    if (message.includes('GIST_ID') || message.includes('GIST_TOKEN')) {
      return new NextResponse(`// Config error: ${message}. Copy .env.example to .env.local and set GIST_ID, GIST_TOKEN.`, {
        status: 503,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    }
    throw err
  }
}
