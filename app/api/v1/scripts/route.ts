import { api } from '@/initializer/controller'
import { jsonSuccess, jsonUnauthorized } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'
import { listManagedScriptFiles } from '@/services/scripts/gistScripts'

/**
 * GET /api/v1/scripts — list managed script files (metadata only).
 */
export const GET = api(async (req) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }

  const { files, gistUpdatedAt } = await listManagedScriptFiles()
  return jsonSuccess({ files, gistUpdatedAt })
})
