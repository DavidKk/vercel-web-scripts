import { serveRemoteScriptModule } from '@/services/runtime/serveRemoteScriptModule'

interface Params {
  key: string
  hash: string
  file: string
}

/**
 * GET /static/[key]/[hash]/scripts/[file]
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  return serveRemoteScriptModule(req, { key: params.key, hash: params.hash, file: params.file, track: 'stable' })
}
