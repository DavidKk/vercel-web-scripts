import { NextResponse } from 'next/server'

import { getExtensionReleaseInfo } from '@/services/extension/getExtensionReleaseInfo'

/**
 * GET /api/extension/version
 * Returns latest packaged Chrome extension semver and download URL for the current deployment.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const info = await getExtensionReleaseInfo(baseUrl)
  return NextResponse.json(info, {
    headers: {
      'Cache-Control': 'public, max-age=60, must-revalidate',
    },
  })
}
