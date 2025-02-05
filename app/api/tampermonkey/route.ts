import { NextResponse } from 'next/server'
import { plainText } from '@/initializer/controller'
import { textInvalidParameters } from '@/initializer/response'
import { fetchGist, getGistInfo } from '@/services/gist'
import { clearMeta, extractMeta } from '@/services/tampermonkey'
import { matchUrl } from '@/utils/url'
import { EXCLUDED_FILES } from '@/constants/file'

export const GET = plainText(async (req) => {
  const uri = new URL(req.url)
  const encodedUrl = uri.searchParams.get('url')
  if (!encodedUrl) {
    return textInvalidParameters('url parameter is required')
  }

  const url = decodeURIComponent(encodedUrl)
  if (!/^https?:\/\//.test(url)) {
    return textInvalidParameters('url must start with http:// or https://')
  }

  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const files = Array.from(
    (function* () {
      for (const [file, { content }] of Object.entries(gist.files)) {
        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        if (!(meta.match && meta.source)) {
          continue
        }

        const match = Array.isArray(meta.match) ? meta.match : [meta.match]
        if (match.some((m) => matchUrl(m, url))) {
          yield content
        }
      }
    })()
  )

  const content = clearMeta(files.join('\n'))
  return new NextResponse(content, {
    headers: {
      'Cache-Control': 'no-store,no-cache,must-revalidate,private',
    },
  })
})
