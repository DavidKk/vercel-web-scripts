import { plainText } from '@/initializer/controller'
import { fetchGist, getGistInfo } from '@/services/gist'
import { createUserScript, extractMeta } from '@/services/tampermonkey'
import { EXCLUDED_FILES } from '@/constants/file'

export const GET = plainText(async (req) => {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })
  const files = Object.fromEntries(
    (function* () {
      for (const [file, { content }] of Object.entries(gist.files)) {
        if (EXCLUDED_FILES.includes(file)) {
          continue
        }

        const meta = extractMeta(content)
        if (!(meta.match && meta.source)) {
          continue
        }

        yield [file, content]
      }
    })()
  )

  const scriptUrl = req.url
  const version = `0.${(new Date(gist.updated_at).getTime() / 1e3).toString()}`
  return createUserScript({ scriptUrl, version, files }).replace(/\r\n/g, '\n')
})
