import { NextResponse } from 'next/server'

import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { createLauncherScript } from '@/services/tampermonkey/launcherScript'

export interface Params {
  key: string
}

/**
 * GET /static/[key]/tampermonkey.user.js
 * Serves the launcher (startup) userscript — the single entry users install.
 * Launcher loads preset from /static/preset.js and remote from /static/[key]/tampermonkey-remote.js.
 * Preset and remote can be updated without reinstalling this script.
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const scriptUrl = req.url
  const version = '1.0.0'

  const content = createLauncherScript({
    baseUrl,
    key,
    launcherScriptUrl: scriptUrl,
    version,
  })

  return new NextResponse(content.replace(/\r\n/g, '\n'), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}

/** Support HEAD so clients (e.g. Tampermonkey) that check with HEAD get 200 instead of 405 */
export async function HEAD(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return new NextResponse(null, { status: 404 })
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
