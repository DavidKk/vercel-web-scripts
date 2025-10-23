import { headers } from 'next/headers'
import { fetchFiles } from '@/app/api/scripts/actions'
import { checkAccess } from '@/services/auth/access'
import { fetchStackblitzTemplate, isMissStackblitzFiles } from '@/services/tampermonkey/gmCore'
import Editor from './Editor'

export default async function Home() {
  await checkAccess({ isApiRouter: false, redirectUrl: '/tampermonkey/editor' })

  const files = await fetchFiles()
  if (!isMissStackblitzFiles(...Object.keys(files))) {
    return <Editor files={files} />
  }

  const headersList = headers()
  const host = (await headersList).get('host')
  const protocol = (await headersList).get('x-forwarded-proto') || 'http'
  const baseUrl = `${protocol}://${host}`
  const stackblitzTemplateFiles = await fetchStackblitzTemplate(baseUrl)
  for (const [fileName, fileContent] of Object.entries(stackblitzTemplateFiles)) {
    if (files[fileName]) {
      continue
    }

    files[fileName] = {
      content: fileContent,
      rawUrl: `${baseUrl}/gm-template/stackblitz/${fileName}`,
    }
  }

  return <Editor files={files} />
}
