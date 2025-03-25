import { api } from '@/initializer/controller'
import { josnNotFound, jsonSuccess } from '@/initializer/response'
import { getRules } from '@/app/actions/tampermonkey'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey'

export interface Params {
  key: string
}

export const GET = api<Params>(async (_, context) => {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return josnNotFound()
  }

  const rules = await getRules()
  return jsonSuccess(rules)
})
