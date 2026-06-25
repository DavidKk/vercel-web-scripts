import { servePresetOrUiBySegment } from '@/services/runtime/servePresetOrUiBySegment'

interface Params {
  key: string
  hash: string
}

/**
 * GET /static/[key]/[hash]/editor-lib.js
 * Optional editor bundle: `hash` = `pending` or content SHA-1.
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  return servePresetOrUiBySegment(req, { key: params.key, segment: params.hash }, 'editor-lib')
}
