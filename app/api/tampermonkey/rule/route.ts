import { api } from '@/initializer/controller'
import { jsonSuccess } from '@/initializer/response'
import { getRules } from '@/app/actions/tampermonkey'

export const GET = api(async () => {
  const rules = await getRules()
  return jsonSuccess(rules)
})
