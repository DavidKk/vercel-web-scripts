'use server'

import { withAuthAction } from '@/initializer/wrapper'
import { fetchGist, getGistInfo } from '@/services/gist'
import { clearMeta, extractMeta } from '@/services/tampermonkey'
import { matchUrl } from '@/utils/url'
import { EXCLUDED_FILES } from '@/constants/file'

export const readScript = withAuthAction(async (url: string) => {
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

  const content = files.join('\n')
  return clearMeta(content)
})
