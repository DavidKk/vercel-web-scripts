import { NextResponse } from 'next/server'

import { CONTENT_ADDRESSED_CACHE_CONTROL, isContentAddressedMatch, isSha1ContentHash, PENDING_SEGMENT, REVALIDATE_CACHE_CONTROL } from '@/services/runtime/contentAddressedAssets'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { getPresetBundle, getPresetManifest, getPresetUiBundle, getPresetUiManifest } from '@/services/tampermonkey/gmCore'

/**
 * Normalize ETag from If-None-Match (strip W/ and quotes).
 * @param etag Raw header value
 * @returns Normalized value or null
 */
function normalizeEtag(etag: string | null): string | null {
  if (!etag || typeof etag !== 'string') return null
  const s = etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return s || null
}

export type PresetOrUiKind = 'preset-core' | 'preset-ui'

/**
 * Serve preset core or preset-ui for `/static/[key]/[hash]/preset*.js` (hash = `pending` or SHA-1 hex).
 * @param req Incoming request
 * @param params Route params (key + segment: same value as `[hash]` dynamic param)
 * @param kind Which bundle to serve
 * @returns Script or error response
 */
export async function servePresetOrUiBySegment(req: Request, params: { key: string; segment: string }, kind: PresetOrUiKind): Promise<NextResponse> {
  if (params.key !== getTampermonkeyScriptKey()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const getManifest = kind === 'preset-core' ? getPresetManifest : getPresetUiManifest
  const getBundle = kind === 'preset-core' ? getPresetBundle : getPresetUiBundle
  const warnTag = kind === 'preset-core' ? '[preset.js]' : '[preset-ui.js]'
  const logTag = kind === 'preset-core' ? '[preset.js@segment]' : '[preset-ui.js@segment]'

  const reqUrl = new URL(req.url)
  const hParam = reqUrl.searchParams.get('h')
  const clientEtag = normalizeEtag(req.headers.get('If-None-Match'))

  try {
    if (params.segment === PENDING_SEGMENT) {
      const manifest = await getManifest()
      const currentHash = manifest?.hash ?? null

      if (hParam && currentHash && hParam !== currentHash) {
        return new NextResponse(`console.warn("${warnTag} Stale h= param; refetch module manifest from the server.");`, {
          status: 404,
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'private, no-store',
          },
        })
      }

      const versioned = isContentAddressedMatch(hParam, currentHash)
      const cacheControl = versioned ? CONTENT_ADDRESSED_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL

      if (manifest && clientEtag != null && clientEtag === manifest.hash) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            'Cache-Control': cacheControl,
            ETag: `"${manifest.hash}"`,
          },
        })
      }

      const content = await getBundle()
      const body = kind === 'preset-ui' ? content.replace(/\r\n/g, '\n') : content
      return new NextResponse(body, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': cacheControl,
          ...(manifest ? { ETag: `"${manifest.hash}"` } : {}),
        },
      })
    }

    if (!isSha1ContentHash(params.segment)) {
      return new NextResponse('Not Found', { status: 404 })
    }

    const manifest = await getManifest()
    if (!manifest || params.segment !== manifest.hash) {
      return new NextResponse(`console.warn("${warnTag} Stale path hash; refetch module manifest from the server.");`, {
        status: 404,
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      })
    }

    if (clientEtag != null && clientEtag === manifest.hash) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          'Cache-Control': CONTENT_ADDRESSED_CACHE_CONTROL,
          ETag: `"${manifest.hash}"`,
        },
      })
    }

    const content = await getBundle()
    const body = kind === 'preset-ui' ? content.replace(/\r\n/g, '\n') : content
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': CONTENT_ADDRESSED_CACHE_CONTROL,
        ETag: `"${manifest.hash}"`,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const isMissing = (e as NodeJS.ErrnoException)?.code === 'ENOENT'
    // eslint-disable-next-line no-console -- route errors must be visible in terminal
    console.error(`${logTag} GET failed:`, e)
    const body = isMissing ? `console.warn("${warnTag} File not built yet. Run: pnpm run build:preset");` : `console.error("${warnTag} ${message}");`
    return new NextResponse(body, {
      status: isMissing ? 503 : 500,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    })
  }
}
