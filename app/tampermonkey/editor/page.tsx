import { headers } from 'next/headers'
import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import { fetchCoreScripts, fetchCoreUIs, compileScriptTypings } from '@/services/tampermonkey/gmCore'
import Editor from './Editor'

export default async function Home() {
  await checkAccess({ isApiRouter: false, redirectUrl: '/tampermonkey/editor' })
  const headersList = headers()
  const host = (await headersList).get('host')
  const protocol = (await headersList).get('x-forwarded-proto') || 'http'
  const baseUrl = `${protocol}://${host}`
  const coreScripts = await fetchCoreScripts(baseUrl)
  const coreUIs = await fetchCoreUIs(baseUrl, true)
  const typings = await compileScriptTypings({
    ...coreScripts,
    ...coreUIs,
  })

  const files = await fetchFiles()
  files['typings.d.ts'] = {
    content: typings,
    rawUrl: `${baseUrl}/gm-template/typings.d.ts`,
  }

  return <Editor files={files} />
}
