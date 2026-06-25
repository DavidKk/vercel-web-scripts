import type { NextRequest } from 'next/server'

import { api } from '@/initializer/controller'
import { jsonSuccess, jsonUnauthorized, standardResponseError } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'
import { isManagedScriptFilename, lockManagedScriptVersion, publishManagedScriptStable, unlockManagedScriptVersion } from '@/services/scripts/gistScripts'

export interface FilenameParams {
  filename: string
}

type OtaActionBody = {
  action?: unknown
  version?: unknown
}

/**
 * POST /api/v1/scripts/:filename/ota — publish-stable, lock, or unlock fleet OTA policy.
 */
export const POST = api<FilenameParams>(async (req: NextRequest, context) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }

  const { filename: raw } = await context.params
  const filename = decodeURIComponent(raw)
  if (!isManagedScriptFilename(filename)) {
    return standardResponseError('invalid script filename', { code: 400 }).toJsonResponse(400)
  }

  const body = (await req.json().catch(() => null)) as OtaActionBody | null
  const action = typeof body?.action === 'string' ? body.action.trim() : ''
  if (!action) {
    return standardResponseError('body.action is required (publish-stable | lock | unlock)', { code: 400 }).toJsonResponse(400)
  }

  try {
    if (action === 'publish-stable') {
      const script = await publishManagedScriptStable(filename)
      return jsonSuccess({ filename, action, script })
    }
    if (action === 'lock') {
      const version = typeof body?.version === 'string' ? body.version : undefined
      const script = await lockManagedScriptVersion(filename, version)
      return jsonSuccess({ filename, action, script })
    }
    if (action === 'unlock') {
      const script = await unlockManagedScriptVersion(filename)
      return jsonSuccess({ filename, action, script })
    }
    return standardResponseError('unknown action', { code: 400 }).toJsonResponse(400)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return standardResponseError(message, { code: 400 }).toJsonResponse(400)
  }
})
