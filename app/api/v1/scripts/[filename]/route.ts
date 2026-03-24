import type { NextRequest } from 'next/server'

import { api } from '@/initializer/controller'
import { jsonSuccess, jsonUnauthorized, standardResponseError } from '@/initializer/response'
import { authorizeScriptIntegration } from '@/services/auth/integrationAuth'
import { deleteManagedScriptFile, getManagedScriptFile, isManagedScriptFilename, upsertManagedScriptFile } from '@/services/scripts/gistScripts'

export interface FilenameParams {
  filename: string
}

/**
 * GET /api/v1/scripts/:filename — read one script file.
 */
export const GET = api<FilenameParams>(async (req: NextRequest, context) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }

  const { filename: raw } = await context.params
  const filename = decodeURIComponent(raw)
  if (!isManagedScriptFilename(filename)) {
    return standardResponseError('invalid script filename', { code: 400 }).toJsonResponse(400)
  }

  try {
    const data = await getManagedScriptFile(filename)
    return jsonSuccess(data)
  } catch {
    return standardResponseError('not found', { code: 404 }).toJsonResponse(404)
  }
})

/**
 * PUT /api/v1/scripts/:filename — body `{ "content": "..." }`.
 */
export const PUT = api<FilenameParams>(async (req: NextRequest, context) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }

  const { filename: raw } = await context.params
  const filename = decodeURIComponent(raw)
  if (!isManagedScriptFilename(filename)) {
    return standardResponseError('invalid script filename', { code: 400 }).toJsonResponse(400)
  }

  const body = (await req.json().catch(() => null)) as { content?: unknown } | null
  if (!body || typeof body.content !== 'string') {
    return standardResponseError('body must be JSON with string "content"', { code: 400 }).toJsonResponse(400)
  }

  await upsertManagedScriptFile(filename, body.content)
  return jsonSuccess({ filename, ok: true })
})

/**
 * DELETE /api/v1/scripts/:filename — remove file from Gist.
 */
export const DELETE = api<FilenameParams>(async (req: NextRequest, context) => {
  if (!(await authorizeScriptIntegration(req))) {
    return jsonUnauthorized()
  }

  const { filename: raw } = await context.params
  const filename = decodeURIComponent(raw)
  if (!isManagedScriptFilename(filename)) {
    return standardResponseError('invalid script filename', { code: 400 }).toJsonResponse(400)
  }

  try {
    await deleteManagedScriptFile(filename)
  } catch {
    return standardResponseError('not found or could not delete', { code: 404 }).toJsonResponse(404)
  }

  return jsonSuccess({ filename, ok: true })
})
