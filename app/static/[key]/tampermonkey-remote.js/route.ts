import { NextResponse } from 'next/server'

import { REVALIDATE_CACHE_CONTROL } from '@/services/runtime/contentAddressedAssets'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { buildRemoteScriptBundleFromGist } from '@/services/tampermonkey/remoteScriptBundle.server'

export interface Params {
  key: string
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
 * GET /static/[key]/tampermonkey-remote.js
 * Returns GIST-compiled script (legacy URL). Prefer manifest `script-bundle` path with hash for edge caching.
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  try {
    const params = await context.params
    const key = getTampermonkeyScriptKey()
    if (params.key !== key) {
      return new NextResponse('Not Found', { status: 404 })
    }

    const bundle = await buildRemoteScriptBundleFromGist('stable')
    if (!bundle) {
      return new NextResponse('// No script files to compile from Gist.\n', {
        status: 404,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    }

    const ifNoneMatch = normalizeEtag(req.headers.get('If-None-Match'))
    if (ifNoneMatch && ifNoneMatch === bundle.hash) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: `"${bundle.hash}"`,
          'Cache-Control': REVALIDATE_CACHE_CONTROL,
        },
      })
    }

    return new NextResponse(bundle.content, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': REVALIDATE_CACHE_CONTROL,
        ETag: `"${bundle.hash}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console -- route errors must be visible in terminal
    console.error('[tampermonkey-remote.js] GET failed:', err)
    if (message.includes('GIST_ID') || message.includes('GIST_TOKEN')) {
      return new NextResponse(`// Config error: ${message}. Copy .env.example to .env.local and set GIST_ID, GIST_TOKEN.`, {
        status: 503,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    }
    throw err
  }
}
