import { fetchGist, getGistInfo } from '@/services/gist'
import { createUserScript } from '@/services/tampermonkey/createUserScript.server'
import { plainText } from '@/initializer/controller'
import { EXCLUDED_FILES } from '@/constants/file'

export const POST = plainText(async (req) => {
  const body = (await req.json()) as Record<string, string>
  const files = body.files || {}
  if (Object.keys(files).length === 0) {
    throw new Error('No files provided')
  }

  const scriptUrl = req.url
  const version = `0.${(new Date().getTime() / 1e3).toString()}`
  const content = await createUserScript({ scriptUrl, version, files })
  return content.replace(/\r\n/g, '\n')
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
