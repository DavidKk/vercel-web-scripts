import { NextResponse } from 'next/server'

import { EXCLUDED_FILES } from '@/constants/file'
import { fetchGist, getGistInfo } from '@/services/gist'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { getRemoteScriptContent } from '@/services/tampermonkey/createUserScript.server'

export interface Params {
  key: string
}

/**
 * GET /static/[key]/tampermonkey-remote.js
 * Returns only the GIST-compiled script content (no banner, no preset).
 * Used by launcher: preset fetches this URL via __SCRIPT_URL__ and runs it.
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const files = Object.fromEntries(
    (function* () {
      for (const [file, { content }] of Object.entries(gist.files)) {
        if (!(file.endsWith('.js') || (file.endsWith('.ts') && !file.endsWith('.d.ts')))) {
          continue
        }
        if (EXCLUDED_FILES.includes(file)) {
          continue
        }
        yield [file, content]
      }
    })()
  )

  const content = await getRemoteScriptContent(files)
  return new NextResponse(content.replace(/\r\n/g, '\n'), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
