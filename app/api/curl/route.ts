import { buffer } from '@/initializer/controller'
import { executeCurlAsFetch } from '@/services/curl'

export const POST = buffer(async (req) => {
  const body = await req.json()
  const content = body.content
  if (!(typeof content === 'string' && content)) {
    throw new Error('No curl command provided')
  }

  const response = await executeCurlAsFetch(content)
  if (!response.ok) {
    throw new Error('Failed to execute curl command')
  }

  return response.arrayBuffer()
})
