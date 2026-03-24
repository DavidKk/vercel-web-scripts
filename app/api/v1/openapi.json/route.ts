import { NextResponse } from 'next/server'

import { api } from '@/initializer/controller'
import { jsonUnauthorized } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'
import { SCRIPTS_OPENAPI_V1 } from '@/services/scripts/openapiV1'

/**
 * GET /api/v1/openapi.json — OpenAPI document for script integration REST.
 */
export const GET = api(async (req) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }

  return NextResponse.json(SCRIPTS_OPENAPI_V1)
})
