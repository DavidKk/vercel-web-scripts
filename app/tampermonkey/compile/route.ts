import { NextResponse } from 'next/server'

import { EXCLUDED_FILES } from '@/constants/file'
import { plainText } from '@/initializer/controller'
import { fetchGist, getGistInfo } from '@/services/gist'
import { getRemoteScriptContent } from '@/services/tampermonkey/createUserScript.server'

/**
 * POST /tampermonkey/compile
 * Compiles script files only (same pipeline as tampermonkey-remote.js). No preset, no userscript banner.
 */
export const POST = plainText(async (req) => {
  const body = (await req.json()) as { files?: Record<string, string> }
  const files = body.files || {}
  if (Object.keys(files).length === 0) {
    return new NextResponse('No files provided', { status: 400 })
  }

  try {
    const content = await getRemoteScriptContent(files)
    return content.replace(/\r\n/g, '\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new NextResponse(message, { status: 400 })
  }
})

export const GET = plainText(async (req) => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Only available in development mode')
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

  const response = await fetch(req.url, {
    method: 'POST',
    body: JSON.stringify({ files }),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to compile script')
  }

  return response.text()
})
