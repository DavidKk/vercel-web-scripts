import { getScriptsGistUpdatedAt } from '@/app/actions/tampermonkey'
import { api } from '@/initializer/controller'
import { josnNotFound, jsonSuccess } from '@/initializer/response'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'

export interface Params {
  key: string
}

/** GET /api/tampermonkey/:key/scripts/version — Gist revision time (epoch ms) for cache invalidation. */
export const GET = api<Params>(async (_, context) => {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return josnNotFound()
  }

  const gistUpdatedAt = await getScriptsGistUpdatedAt()
  return jsonSuccess({ gistUpdatedAt })
})
