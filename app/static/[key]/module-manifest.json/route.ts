import { NextResponse } from 'next/server'

import { buildRuntimeModuleManifest, buildRuntimeModuleManifestEtag } from '@/services/runtime/moduleManifest'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'

interface Params {
  key: string
}

/**
 * Normalize ETag from If-None-Match (strip weak prefix and quotes).
 * @param etag Raw If-None-Match header
 * @returns Normalized ETag value or null
 */
function normalizeEtag(etag: string | null): string | null {
  if (!etag || typeof etag !== 'string') return null
  const value = etag.trim().replace(/^W\//i, '').replace(/^"|"$/g, '')
  return value || null
}

/**
 * GET /static/[key]/module-manifest.json
 * Returns runtime module manifest for launcher/core/ui/script-bundle wiring.
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const manifest = await buildRuntimeModuleManifest(baseUrl, key)
  const etag = buildRuntimeModuleManifestEtag(manifest)
  const ifNoneMatch = normalizeEtag(req.headers.get('If-None-Match'))
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304 })
  }

  return NextResponse.json(manifest, {
    headers: {
      ETag: `"${etag}"`,
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
