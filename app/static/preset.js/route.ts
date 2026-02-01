import { NextResponse } from 'next/server'

import { getPresetBundle } from '@/services/tampermonkey/gmCore'

/**
 * GET /static/preset.js
 * Serves the preset bundle for launcher dynamic loading.
 * Launcher caches this and runs it with __SCRIPT_URL__ pointing to remote script.
 */
export async function GET() {
  try {
    const content = getPresetBundle()
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return new NextResponse(`console.error("[preset.js] ${message}");`, {
      status: 500,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    })
  }
}
