import { NextResponse } from 'next/server'
import { plainText } from '@/initializer/controller'
import { fetchGist, getGistInfo } from '@/services/gist'
import { extractMeta, getTampermonkeyScriptKey } from '@/services/tampermonkey'
import { createUserScript } from '@/services/tampermonkey/createUserScript.server'
import { EXCLUDED_FILES } from '@/constants/file'

export interface Params {
  key: string
}

export const GET = plainText<Params>(async (req, context) => {
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

  const scriptUrl = req.url
  const version = `0.${(new Date(gist.updated_at).getTime() / 1e3).toString()}`
  const content = await createUserScript({ scriptUrl, version, files })
  return content.replace(/\r\n/g, '\n')
})
