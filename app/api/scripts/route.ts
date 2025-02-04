import { api } from '@/initializer/controller'
import { jsonSuccess } from '@/initializer/response'
import { fetchFiles } from './actions'

export const GET = api(async () => {
  const files = await fetchFiles()
  return jsonSuccess({ files })
})
