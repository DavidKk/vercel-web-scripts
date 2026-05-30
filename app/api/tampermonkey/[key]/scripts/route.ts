import { getScriptsWithMeta } from '@/app/actions/tampermonkey'
import { api } from '@/initializer/controller'
import { josnNotFound, jsonSuccess } from '@/initializer/response'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'

export interface Params {
  key: string
}

/** GET /api/tampermonkey/:key/scripts — managed Gist script files (excludes rules JSON and entry). */
export const GET = api<Params>(async (_, context) => {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return josnNotFound()
  }

  const { scripts, gistUpdatedAt } = await getScriptsWithMeta()
  return jsonSuccess({ scripts, gistUpdatedAt })
})
