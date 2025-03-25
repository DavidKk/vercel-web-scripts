import { plainText } from '@/initializer/controller'
import { fetchGist, getGistInfo } from '@/services/gist'
import { createUserScript, extractMeta, getTampermonkeyScriptKey } from '@/services/tampermonkey'
import { EXCLUDED_FILES } from '@/constants/file'
import { NextResponse } from 'next/server'

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
        if (!file.endsWith('.js')) {
          continue
        }

        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        if (!meta.match) {
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
