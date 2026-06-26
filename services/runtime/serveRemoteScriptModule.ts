import { NextResponse } from 'next/server'

import { CONTENT_ADDRESSED_CACHE_CONTROL, isSha1ContentHash, REVALIDATE_CACHE_CONTROL } from '@/services/runtime/contentAddressedAssets'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { buildRemoteScriptModuleFromGist } from '@/services/tampermonkey/remoteScriptBundle.server'
import type { ScriptBundleTrack } from '@/shared/script-ota-policy'

/**
 * Normalize ETag from If-None-Match.
 */
function normalizeEtag(etag: string | null): string | null {
  if (!etag || typeof etag !== 'string') return null
  const value = etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return value || null
}

export interface ServeRemoteScriptModuleParams {
  key: string
  file: string
  hash?: string
  track?: ScriptBundleTrack
}

/**
 * Serve one compiled Gist script module (stable or alpha track).
 */
export async function serveRemoteScriptModule(req: Request, params: ServeRemoteScriptModuleParams): Promise<NextResponse> {
  const scriptKey = getTampermonkeyScriptKey()
  if (params.key !== scriptKey) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const filename = decodeURIComponent(params.file)
  const track: ScriptBundleTrack = params.track === 'alpha' ? 'alpha' : 'stable'
  const contentHash = params.hash

  if (contentHash && !isSha1ContentHash(contentHash)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const bundle = await buildRemoteScriptModuleFromGist(filename, track)
    if (!bundle) {
      return new NextResponse(`console.warn("[remote-script-module] No compiled module for ${filename}");`, {
        status: 404,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    }

    if (contentHash && contentHash !== bundle.hash) {
      return new NextResponse(`console.warn("[remote-script-module] Stale path hash for ${filename}; refetch module manifest.");`, {
        status: 404,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const ifNoneMatch = normalizeEtag(req.headers.get('If-None-Match'))
    if (ifNoneMatch && ifNoneMatch === bundle.hash) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: `"${bundle.hash}"`,
          'Cache-Control': contentHash ? CONTENT_ADDRESSED_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL,
        },
      })
    }

    return new NextResponse(bundle.content, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': contentHash ? CONTENT_ADDRESSED_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL,
        ETag: `"${bundle.hash}"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line no-console
    console.error('[remote-script-module] GET failed:', err)
    if (message.includes('GIST_ID') || message.includes('GIST_TOKEN')) {
      return new NextResponse(`// Config error: ${message}. Copy .env.example to .env.local and set GIST_ID, GIST_TOKEN.`, {
        status: 503,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    }
    throw err
  }
}
