import { servePresetOrUiBySegment } from '@/services/runtime/servePresetOrUiBySegment'

interface Params {
  key: string
  hash: string
}

/**
 * GET /static/[key]/[hash]/preset.js
 * Preset core: `hash` = `pending` (no build hash yet) or 40-char SHA-1 (immutable cache).
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  return servePresetOrUiBySegment(req, { key: params.key, segment: params.hash }, 'preset-core')
}
