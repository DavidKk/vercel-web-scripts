'use server'

import { withAuthAction } from '@/initializer/wrapper'
import type { FilesInWriteGistFiles } from '@/services/gist'
import { fetchGist, getGistInfo, writeGistFiles } from '@/services/gist'

export const fetchFiles = withAuthAction(async () => {
  const { gistId, gistToken } = getGistInfo()
  const gist = await fetchGist({ gistId, gistToken })

  const files = Object.fromEntries(
    (function* () {
      for (const [filename, { content, raw_url: rawUrl }] of Object.entries(gist.files)) {
        yield [filename, { content, rawUrl }]
      }
    })()
  )

  return {
    files,
    updatedAt: new Date(gist.updated_at).getTime(),
  }
})

export const updateFiles = withAuthAction(async (...files: FilesInWriteGistFiles[]) => {
  const { gistId, gistToken } = getGistInfo()
  await writeGistFiles({ gistId, gistToken, files })
})
