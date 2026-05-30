import { api } from '@/initializer/controller'
import { josnNotFound, jsonSuccess } from '@/initializer/response'
import { getTampermonkeyScriptKey } from '@/services/tampermonkey/createBanner'
import { getTabMatchSummary } from '@/services/tampermonkey/tabMatch.server'

export interface Params {
  key: string
}

export const GET = api<Params>(async (request, context) => {
  const params = await context.params
  const key = getTampermonkeyScriptKey()
  if (params.key !== key) {
    return josnNotFound()
  }

  const url = request.nextUrl.searchParams.get('url')?.trim() ?? ''
  const summary = await getTabMatchSummary(url)
  return jsonSuccess(summary)
})
