import { serveRemoteScriptModule } from '@/services/runtime/serveRemoteScriptModule'

interface Params {
  key: string
  file: string
}

/**
 * GET /static/[key]/scripts/alpha/[file]
 */
export async function GET(req: Request, context: { params: Promise<Params> }) {
  const params = await context.params
  return serveRemoteScriptModule(req, { key: params.key, file: params.file, track: 'alpha' })
}
