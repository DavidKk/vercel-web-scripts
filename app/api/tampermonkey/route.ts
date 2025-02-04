import { plainText } from '@/initializer/controller'
import { readScript } from './actions'
import { textInvalidParameters } from '@/initializer/response'

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

  return readScript(url)
})
